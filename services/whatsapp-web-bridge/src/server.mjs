import express from 'express';
import pino from 'pino';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

const PORT = Number(process.env.PORT || 3000);
const BRIDGE_TOKEN = String(process.env.BRIDGE_TOKEN || '').trim();
const N8N_INBOUND_URL = String(process.env.N8N_INBOUND_URL || '').trim();
const MODEL_API_KEY = String(process.env.MODEL_API_KEY || '').trim();
const MODEL_BASE_URL = String(process.env.MODEL_BASE_URL || 'https://api.meta.ai/v1').replace(/\/$/, '');
const MODEL_NAME = String(process.env.MODEL_NAME || 'muse-spark-1.2').trim();
const MODEL_REASONING_EFFORT = String(process.env.MODEL_REASONING_EFFORT || 'high').trim();
const WA_PHONE_NUMBER = String(process.env.WA_PHONE_NUMBER || '').replace(/\D/g, '');
const WA_AUTH_DIR = String(process.env.WA_AUTH_DIR || './data/auth').trim();
const ALLOW_GROUPS = String(process.env.ALLOW_GROUPS || 'false').toLowerCase() === 'true';

if (!BRIDGE_TOKEN) throw new Error('BRIDGE_TOKEN is required');
if (!N8N_INBOUND_URL && !MODEL_API_KEY) {
  throw new Error('Configure N8N_INBOUND_URL or MODEL_API_KEY');
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
app.use(express.json({ limit: '1mb' }));

let sock;
let connectionState = 'starting';
let pairingCode = null;
let reconnectTimer = null;
let starting = false;
const seenMessageIds = new Set();

function requireBridgeToken(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.get('x-bridge-token') || '';
  if (token !== BRIDGE_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function extractText(message = {}) {
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();
}

function rememberMessage(id) {
  if (!id) return true;
  if (seenMessageIds.has(id)) return false;
  seenMessageIds.add(id);
  if (seenMessageIds.size > 1000) {
    const first = seenMessageIds.values().next().value;
    if (first) seenMessageIds.delete(first);
  }
  return true;
}

async function postToN8n(payload) {
  const response = await fetch(N8N_INBOUND_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bhg-whatsapp-source': 'baileys',
      'x-bridge-token': BRIDGE_TOKEN,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`n8n returned ${response.status}: ${raw.slice(0, 300)}`);
  }

  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { reply: raw.trim() };
  }
}

function extractModelText(data) {
  if (!data || typeof data !== 'object') return String(data || '').trim();
  if (typeof data.output_text === 'string') return data.output_text.trim();

  const parts = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    if (typeof item?.text === 'string') parts.push(item.text);
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') parts.push(content.text);
      if (typeof content?.output_text === 'string') parts.push(content.output_text);
    }
  }
  return parts.join('\n').trim();
}

async function askMetaModel(payload) {
  const instructions = [
    'أنت مساعد واتساب لمجموعة BHG للحجوزات وخدمة العملاء.',
    'اكتب بالعربية بشكل مختصر ومهني، واستخدم لغة العميل إذا كانت رسالته بغير العربية.',
    'لا تدّع تنفيذ حجز أو تعديل أو إلغاء ما لم تكن لديك أداة فعلية تؤكد ذلك.',
    'لا تطلب كلمات مرور أو رموز تحقق أو بيانات بطاقات، ولا تكشف أي أسرار أو مفاتيح.',
    'إذا لم تتوفر المعلومة، قل ذلك بوضوح واطلب الحد الأدنى اللازم أو وجّه لموظف مختص.',
  ].join(' ');

  const response = await fetch(`${MODEL_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${MODEL_API_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      instructions,
      input: payload.text,
      reasoning: {
        effort: MODEL_REASONING_EFFORT,
        summary: 'auto',
      },
    }),
    signal: AbortSignal.timeout(60000),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Meta Model API returned ${response.status}: ${raw.slice(0, 300)}`);
  }

  const data = raw ? JSON.parse(raw) : {};
  return { reply: extractModelText(data) };
}

async function generateReply(payload) {
  if (N8N_INBOUND_URL) return postToN8n(payload);
  return askMetaModel(payload);
}

function normalizeReply(data) {
  if (!data || typeof data !== 'object') return String(data || '').trim();
  return String(data.reply || data.output || data.text || data.message || data.response || '').trim();
}

function scheduleReconnect(delayMs = 3000) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWhatsApp().catch((error) => logger.error({ err: error }, 'Reconnect failed'));
  }, delayMs);
}

async function startWhatsApp() {
  if (starting) return;
  starting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    connectionState = 'connecting';
    pairingCode = null;

    sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('BHG WhatsApp Bridge'),
      logger: logger.child({ module: 'baileys' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        connectionState = 'ready';
        pairingCode = null;
        logger.info('WhatsApp linked and ready');
      }

      if (connection === 'close') {
        connectionState = 'disconnected';
        const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        logger.warn({ statusCode, loggedOut }, 'WhatsApp connection closed');

        if (!loggedOut) {
          scheduleReconnect();
        } else {
          pairingCode = null;
          logger.error('Session logged out. Delete the auth directory and pair again.');
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const item of messages || []) {
        try {
          if (!item?.message || item.key?.fromMe) continue;

          const messageId = item.key?.id || '';
          if (!rememberMessage(messageId)) continue;

          const remoteJid = item.key?.remoteJid || '';
          if (!remoteJid || remoteJid === 'status@broadcast') continue;
          if (!ALLOW_GROUPS && remoteJid.endsWith('@g.us')) continue;

          const text = extractText(item.message);
          if (!text) continue;

          const payload = {
            source: 'whatsapp-web-baileys',
            from: remoteJid.replace(/@.+$/, ''),
            remoteJid,
            text,
            pushName: item.pushName || '',
            messageId,
            timestamp: Number(item.messageTimestamp || Date.now() / 1000),
            isGroup: remoteJid.endsWith('@g.us'),
          };

          logger.info({ from: payload.from, messageId: payload.messageId }, 'Incoming WhatsApp message');
          const result = await generateReply(payload);
          const reply = normalizeReply(result);

          if (reply && sock) {
            await sock.sendMessage(remoteJid, { text: reply.slice(0, 4000) });
          }
        } catch (error) {
          logger.error({ err: error }, 'Failed to process WhatsApp message');
        }
      }
    });

    if (!state.creds.registered && WA_PHONE_NUMBER) {
      setTimeout(async () => {
        try {
          pairingCode = await sock.requestPairingCode(WA_PHONE_NUMBER);
          logger.info({ pairingCode }, 'WhatsApp pairing code generated');
        } catch (error) {
          logger.error({ err: error }, 'Could not generate pairing code');
        }
      }, 1500);
    }
  } finally {
    starting = false;
  }
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    connection: connectionState,
    paired: connectionState === 'ready',
    replyMode: N8N_INBOUND_URL ? 'n8n' : 'meta-model-api',
  });
});

app.get('/pairing-code', requireBridgeToken, (_req, res) => {
  res.json({
    connection: connectionState,
    pairingCode,
    message: pairingCode ? 'Use this code in WhatsApp > Linked devices > Link with phone number.' : 'No pairing code available yet.',
  });
});

app.post('/send', requireBridgeToken, async (req, res) => {
  if (!sock || connectionState !== 'ready') {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }

  const to = String(req.body?.to || '').replace(/\D/g, '');
  const text = String(req.body?.text || '').trim();
  if (!to || !text) return res.status(400).json({ error: 'to and text are required' });

  const jid = `${to}@s.whatsapp.net`;
  const result = await sock.sendMessage(jid, { text: text.slice(0, 4000) });
  res.json({ ok: true, messageId: result?.key?.id || null });
});

app.post('/reconnect', requireBridgeToken, (_req, res) => {
  scheduleReconnect(100);
  res.status(202).json({ ok: true, message: 'Reconnect scheduled' });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, replyMode: N8N_INBOUND_URL ? 'n8n' : 'meta-model-api' }, 'BHG WhatsApp Web Bridge listening');
  startWhatsApp().catch((error) => {
    connectionState = 'error';
    logger.error({ err: error }, 'Initial WhatsApp connection failed');
    scheduleReconnect(5000);
  });
});
