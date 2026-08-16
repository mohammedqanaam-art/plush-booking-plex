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
const WA_PHONE_NUMBER = String(process.env.WA_PHONE_NUMBER || '').replace(/\D/g, '');
const WA_AUTH_DIR = String(process.env.WA_AUTH_DIR || './data/auth').trim();
const ALLOW_GROUPS = String(process.env.ALLOW_GROUPS || 'false').toLowerCase() === 'true';

if (!BRIDGE_TOKEN) throw new Error('BRIDGE_TOKEN is required');
if (!N8N_INBOUND_URL) throw new Error('N8N_INBOUND_URL is required');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
app.use(express.json({ limit: '1mb' }));

let sock;
let connectionState = 'starting';
let pairingCode = null;
let reconnectTimer = null;
let starting = false;

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

    sock.ev.on('connection.update', async (update) => {
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
            messageId: item.key?.id || '',
            timestamp: Number(item.messageTimestamp || Date.now() / 1000),
            isGroup: remoteJid.endsWith('@g.us'),
          };

          logger.info({ from: payload.from, messageId: payload.messageId }, 'Incoming WhatsApp message');
          const n8nResult = await postToN8n(payload);
          const reply = normalizeReply(n8nResult);

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
  res.json({ ok: true, connection: connectionState, paired: connectionState === 'ready' });
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

app.post('/reconnect', requireBridgeToken, async (_req, res) => {
  scheduleReconnect(100);
  res.status(202).json({ ok: true, message: 'Reconnect scheduled' });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'BHG WhatsApp Web Bridge listening');
  startWhatsApp().catch((error) => {
    connectionState = 'error';
    logger.error({ err: error }, 'Initial WhatsApp connection failed');
    scheduleReconnect(5000);
  });
});
