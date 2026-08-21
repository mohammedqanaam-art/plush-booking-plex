import type { Config, Context } from "@netlify/functions";
import {
  isCacheableBoudlQuestion,
  readCachedBoudlAnswer,
  writeCachedBoudlAnswer,
} from "./_shared/boudlAssistantCache";
import {
  BHG_ASSISTANT_SCOPE,
  boudlScopeReply,
  classifyBoudlAssistantScope,
} from "./_shared/boudlAssistantScope";
import { lookupOfficialBoudlSources, type OfficialSource } from "./_shared/boudl-knowledge";
import { callN8nAgent, n8nAgentConfigured } from "./_shared/n8n";
import { generateOpenAiText, isOpenAiAvailable, type OpenAiSource } from "./_shared/openai";
import { json, requireSameOrigin } from "./_shared/security";

type ChatTurn = { role: "user" | "assistant"; content: string };
type PublicSource = { title: string; url: string; snippet?: string };

const cleanText = (value: unknown, maxLength: number) => String(value || "")
  .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[مفتاح محجوب]")
  .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[بيانات دخول محجوبة]")
  .replace(/\b(password|api[_ -]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[محجوب]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد محجوب]")
  .trim()
  .slice(0, maxLength);

const uniqueSources = (...groups: Array<Array<PublicSource | OfficialSource | OpenAiSource>>) => {
  const map = new Map<string, PublicSource>();
  for (const group of groups) {
    for (const source of group) {
      const url = String(source?.url || "").trim();
      if (!/^https:\/\/(?:www\.)?(?:boudl\.com|booking\.boudl\.com)(?:\/|$)/i.test(url)) continue;
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
    .slice(-6)
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
  return `وجدت معلومة مرتبطة بطلبك في موقع بودل الرسمي: ${snippet}`;
};

export default async (req: Request, context?: Context) => {
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

  const scope = classifyBoudlAssistantScope(
    message,
    history.filter((item) => item.role === "user").map((item) => item.content),
  );
  if (scope !== "in_scope") {
    return json({
      reply: boudlScopeReply(scope),
      sessionId,
      requestId,
      provider: "bhg-scope-fast-path",
      model: null,
      sources: [],
      scope: BHG_ASSISTANT_SCOPE,
    });
  }

  const hasConversationContext = history.some((item) => item.role === "user");
  const cacheable = isCacheableBoudlQuestion(message, hasConversationContext);
  if (cacheable) {
    const cached = await readCachedBoudlAnswer(message);
    if (cached) {
      return json({
        reply: cached.reply,
        sessionId,
        requestId,
        provider: "bhg-answer-cache",
        model: cached.model,
        sources: cached.sources,
        scope: BHG_ASSISTANT_SCOPE,
      });
    }
  }

  const [officialSources, openAiAvailable] = await Promise.all([
    lookupOfficialBoudlSources(message).catch((error) => {
      console.error("[visitor-agent] official source lookup failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
      return [] as OfficialSource[];
    }),
    isOpenAiAvailable().catch(() => false),
  ]);

  if (openAiAvailable) {
    try {
      const transcript = history
        .map((item) => `${item.role === "user" ? "الزائر" : "المساعد"}: ${item.content}`)
        .join("\n");
      const evidence = sourceEvidence(officialSources);
      const result = await generateOpenAiText({
        instructions: [
          "أنت المساعد الرقمي الرسمي لزوار مجموعة بودل للضيافة BHG.",
          "نطاقك حصريًا فنادق وعلامات المجموعة: بودل، بريرا، عابر، نارسيس وزمن. ارفض باختصار أي موضوع آخر.",
          "تعامل مع الزائر بود واحترام ومرونة، وأجب باللغة التي يستخدمها.",
          "ساعد في معلومات الفنادق والفروع والمواقع والمرافق والخدمات وسياسات الإقامة العامة وطريقة الحجز والتنقل داخل موقع المجموعة.",
          "لأي معلومة متغيرة أو مرتبطة بفرع محدد، استخدم البحث في المصادر الرسمية Boudl.com وbooking.boudl.com ولا تخمن.",
          "إذا لم تجد معلومة موثوقة، قل ذلك بوضوح واقترح أقرب خطوة مفيدة بدل اختلاق إجابة.",
          "لا تعرض أو تطلب كلمات مرور أو مفاتيح API أو رموز تحقق أو معلومات أنظمة داخلية أو مسارات الإدارة.",
          "لا تنفذ تعديلات على الحجوزات أو المدفوعات، ولا تدّع توفر غرفة أو سعر لحظي دون مصدر حي.",
          "إذا كانت هناك مصادر رسمية في السياق فاستخدمها، ويمكنك استخدام Web Search الرسمي عند الحاجة.",
          "اجعل الإجابة عملية ومباشرة وتجنب العبارات الآلية الجامدة.",
        ].join(" "),
        input: [
          transcript ? `سياق المحادثة:\n${transcript}` : "",
          `سؤال الزائر: ${message}`,
          evidence ? `مقتطفات رسمية متاحة مسبقًا:\n${evidence}` : "",
        ].filter(Boolean).join("\n\n"),
        maxOutputTokens: 800,
        reasoningEffort: "none",
        webSearchAllowedDomains: officialSources.length ? undefined : ["boudl.com", "booking.boudl.com"],
        timeoutMs: 22_000,
      });
      const responseSources = uniqueSources(result.sources, officialSources);
      if (cacheable && responseSources.length) {
        const write = writeCachedBoudlAnswer(message, {
          reply: result.text,
          model: result.model,
          sources: responseSources,
        });
        if (context) context.waitUntil(write);
        else await write;
      }
      return json({
        reply: result.text,
        sessionId,
        requestId,
        model: result.model,
        provider: "openai-responses",
        sources: responseSources,
        scope: BHG_ASSISTANT_SCOPE,
      });
    } catch (error) {
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
        const responseSources = uniqueSources(returnedSources, officialSources);
        if (cacheable && responseSources.length) {
          const write = writeCachedBoudlAnswer(message, {
            reply,
            model: "n8n-managed",
            sources: responseSources,
          });
          if (context) context.waitUntil(write);
          else await write;
        }
        return json({
          reply,
          sessionId,
          requestId,
          provider: "n8n-agent",
          model: "n8n-managed",
          sources: responseSources,
          scope: BHG_ASSISTANT_SCOPE,
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
    scope: BHG_ASSISTANT_SCOPE,
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
