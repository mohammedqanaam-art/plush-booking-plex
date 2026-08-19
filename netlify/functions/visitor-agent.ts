import type { Config } from "@netlify/functions";
import { lookupOfficialBoudlSources, type OfficialSource } from "./_shared/boudl-knowledge";
import {
  aiResponseCacheKey,
  isCacheSafeConversation,
  readCachedAiResponse,
  writeCachedAiResponse,
} from "./_shared/aiResponseCache";
import { callN8nAgent, n8nAgentConfigured } from "./_shared/n8n";
import { generateOpenAiText, type OpenAiSource } from "./_shared/openai";
import { json, requireSameOrigin } from "./_shared/security";

type ChatTurn = { role: "user" | "assistant"; content: string };
type PublicSource = { title: string; url: string; snippet?: string };

const cleanText = (value: unknown, maxLength: number) => String(value || "")
  .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[مفتاح محجوب]")
  .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[بيانات دخول محجوبة]")
  .replace(/\b(password|api[_ -]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[محجوب]")
  .replace(/\b\d{8,15}\b/g, "[رقم محجوب]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد محجوب]")
  .trim()
  .slice(0, maxLength);

const allowedPublicSourceUrl = (value: unknown) => {
  try {
    const url = new URL(String(value || "").trim());
    const hostname = url.hostname.toLowerCase();
    const allowed = hostname === "boudl.com"
      || hostname === "www.boudl.com"
      || hostname === "booking.boudl.com"
      || hostname === "booking.com"
      || hostname.endsWith(".booking.com");
    if (url.protocol !== "https:" || !allowed || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const uniqueSources = (...groups: Array<Array<PublicSource | OfficialSource | OpenAiSource>>) => {
  const map = new Map<string, PublicSource>();
  for (const group of groups) {
    for (const source of group) {
      const url = allowedPublicSourceUrl(source?.url);
      if (!url) continue;
      if (!map.has(url)) {
        map.set(url, {
          title: String(source?.title || "Boudl.com").slice(0, 180),
          url,
          ...(typeof (source as PublicSource).snippet === "string" ? { snippet: (source as PublicSource).snippet?.slice(0, 600) } : {}),
        });
      }
    }
  }
  return [...map.values()].slice(0, 6);
};

const historyFromBody = (value: unknown): ChatTurn[] => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-10)
    .filter((item) => item && typeof item === "object")
    .map((item) => item as Record<string, unknown>)
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({
      role: item.role as ChatTurn["role"],
      content: cleanText(item.content, 1_500),
    }))
    .filter((item) => item.content);
};

const sourceEvidence = (sources: OfficialSource[]) => sources
  .slice(0, 5)
  .map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${source.snippet}`)
  .join("\n\n");

const sourceFallback = (sources: OfficialSource[]) => {
  if (!sources.length) {
    return "أهلًا بك. تعذر الوصول للمساعد الذكي الآن، لكن يمكنك المحاولة بعد قليل أو استخدام صفحات الفروع والبحث داخل الموقع للوصول للمعلومة المطلوبة.";
  }
  const first = sources[0];
  const snippet = first.snippet.replace(/\s+/g, " ").trim().slice(0, 850);
  return `وجدت معلومة مرتبطة بطلبك في مصادر BHG المعتمدة: ${snippet}`;
};

export default async (req: Request) => {
  const startedAt = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 32 * 1024) return json({ error: "Request too large" }, 413);

  let body: { message?: string; sessionId?: string; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const message = cleanText(body.message, 2_400);
  if (!message) return json({ error: "message is required" }, 400);

  const requestedSessionId = String(body.sessionId || "").trim();
  const sessionId = /^[a-zA-Z0-9_-]{8,100}$/.test(requestedSessionId)
    ? requestedSessionId
    : `visitor_${crypto.randomUUID()}`;
  const history = historyFromBody(body.history);
  const requestId = crypto.randomUUID();
  const cacheKey = aiResponseCacheKey("visitor", message, history);
  const cacheAllowed = isCacheSafeConversation(message, history);
  const cached = cacheAllowed ? await readCachedAiResponse(cacheKey) : null;
  if (cached) {
    return json({
      ...cached,
      sessionId,
      requestId,
      cacheHit: true,
      durationMs: Date.now() - startedAt,
    });
  }

  let officialSources: OfficialSource[] = [];
  try {
    officialSources = await lookupOfficialBoudlSources(message);
  } catch (error) {
    console.error("[visitor-agent] official source lookup failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
  }

  try {
    const transcript = history
      .map((item) => `${item.role === "user" ? "الزائر" : "المساعد"}: ${item.content}`)
      .join("\n");
    const evidence = sourceEvidence(officialSources);
    const result = await generateOpenAiText({
      instructions: [
        "أنت المساعد الرقمي الرسمي لزوار مجموعة بودل للضيافة BHG.",
        "نطاقك حصراً فروع وعلامات مجموعة BHG؛ ارفض بلطف أي طلب عن منشأة خارج المجموعة.",
        "تعامل مع الزائر بود واحترام، وأجب باللغة التي يستخدمها وباختصار مفيد.",
        "أي حقيقة عن فرع أو مرفق أو سياسة يجب أن تستند فقط إلى مقتطفات BHG المعتمدة المقدمة في السياق؛ لا تستخدم معرفة قديمة ولا تخمن.",
        "Booking.com مصدر ثانوي للتعريف بالفرع فقط، وليس دليلاً على سعر أو توفر لحظي.",
        "إذا لم تكفِ المقتطفات، قل إن المعلومة غير متاحة في المصادر المعتمدة واقترح صفحة الفرع الرسمية.",
        "لا تعرض أو تطلب كلمات مرور أو مفاتيح API أو رموز تحقق أو بيانات شخصية أو معلومات أنظمة داخلية.",
        "لا تنفذ تعديلات على الحجوزات أو المدفوعات، ولا تدّع توفر غرفة أو سعر لحظي.",
      ].join(" "),
      input: [
        transcript ? `سياق المحادثة:\n${transcript}` : "",
        `سؤال الزائر: ${message}`,
        evidence ? `مقتطفات BHG المعتمدة:\n${evidence}` : "لا توجد مقتطفات موثوقة مطابقة لهذا السؤال.",
      ].filter(Boolean).join("\n\n"),
      maxOutputTokens: 700,
      reasoningEffort: "low",
      timeoutMs: 14_000,
    });
    const sources = uniqueSources(result.sources, officialSources);
    const knowledgeUpdatedAt = officialSources.find((source) => source.verifiedAt)?.verifiedAt;
    if (cacheAllowed) {
      await writeCachedAiResponse(cacheKey, {
        reply: result.text,
        sources,
        model: result.model,
        provider: "openai-responses",
        knowledgeUpdatedAt,
      });
    }
    return json({
      reply: result.text,
      sessionId,
      requestId,
      model: result.model,
      provider: "openai-responses",
      sources,
      knowledgeUpdatedAt,
      cacheHit: false,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "OPENAI_NOT_CONFIGURED") {
      console.error("[visitor-agent] OpenAI request failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
    }
  }

  if (n8nAgentConfigured()) {
    try {
      const result = await callN8nAgent({
        version: 2,
        type: "visitor_concierge",
        requestId,
        sessionId,
        actor: { type: "visitor", scope: "public" },
        message,
        history,
        preferredModel: "gpt-5.6-sol",
        officialSources,
        instructions: {
          tone: "welcoming-professional",
          answerLanguage: "match-user",
          officialSourcesFirst: true,
          neverRevealInternalData: true,
          noAdminActions: true,
          noBookingMutation: true,
        },
      }, { timeoutMs: 12_000 });

      if (result.reply) {
        const returnedSources = typeof result.data === "object" && Array.isArray(result.data.sources)
          ? result.data.sources.map((source) => ({
              title: String(source?.title || "Boudl.com"),
              url: String(source?.url || ""),
              snippet: String(source?.snippet || ""),
            }))
          : [];
        const reply = result.reply.slice(0, 7_000);
        const sources = uniqueSources(returnedSources, officialSources);
        const knowledgeUpdatedAt = officialSources.find((source) => source.verifiedAt)?.verifiedAt;
        if (cacheAllowed) {
          await writeCachedAiResponse(cacheKey, {
            reply,
            sources,
            provider: "n8n-agent",
            model: "n8n-managed",
            knowledgeUpdatedAt,
          });
        }
        return json({
          reply,
          sessionId,
          requestId,
          provider: "n8n-agent",
          model: "n8n-managed",
          sources,
          knowledgeUpdatedAt,
          cacheHit: false,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      console.error("[visitor-agent] n8n fallback failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
    }
  }

  return json({
    reply: sourceFallback(officialSources),
    sessionId,
    requestId,
    provider: "official-source-fallback",
    model: null,
    sources: uniqueSources(officialSources),
    cacheHit: false,
    durationMs: Date.now() - startedAt,
  });
};

export const config: Config = {
  path: "/api/visitor/agent",
  rateLimit: {
    windowLimit: 24,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
