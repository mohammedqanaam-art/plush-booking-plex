import type { Config } from "@netlify/functions";
import {
  BHG_ASSISTANT_SCOPE,
  boudlScopeReply,
  classifyBoudlAssistantScope,
} from "./_shared/boudlAssistantScope";
import { lookupOfficialBoudlSources, isOfficialBoudlUrl, type OfficialSource } from "./_shared/boudl-knowledge";
import { callN8nAgent, n8nAgentConfigured, type N8nAgentReply } from "./_shared/n8n";
import { generateOpenAiText, isOpenAiAvailable } from "./_shared/openai";
import { json, requireSameOrigin } from "./_shared/security";

const cleanMessage = (value: unknown) => String(value || "")
  .replace(/\b(?:password|api[_ -]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[محجوب]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد محجوب]")
  .replace(/\b\d{8,15}\b/g, "[رقم محجوب]")
  .trim()
  .slice(0, 1_800);

const safeReturnedSources = (data: N8nAgentReply | string, officialSources: OfficialSource[]) => {
  const returned = typeof data === "object" && data && Array.isArray(data.sources)
    ? data.sources
        .map((source) => ({
          title: String(source?.title || "مصدر بودل الرسمي").slice(0, 180),
          url: String(source?.url || ""),
          snippet: String(source?.snippet || "").slice(0, 800),
        }))
        .filter((source) => isOfficialBoudlUrl(source.url))
        .slice(0, 5)
    : [];
  return returned.length ? returned : officialSources;
};

const fallbackFromSources = (sources: OfficialSource[]) => {
  if (!sources.length) {
    return "لم أتمكن من الوصول إلى مصدر رسمي من موقع بودل الآن. يرجى تحديد اسم الفرع والمدينة بشكل أدق أو المحاولة لاحقًا.";
  }
  const first = sources[0];
  const snippet = first.snippet.replace(/\s+/g, " ").trim().slice(0, 750);
  return `وجدت مصدرًا رسميًا من بودل مرتبطًا بطلبك. ${snippet}${snippet.endsWith(".") ? "" : "."}`;
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 20 * 1024) return json({ error: "Request too large" }, 413);

  let body: { message?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const message = cleanMessage(body.message);
  if (!message) return json({ error: "message is required" }, 400);

  const requestedSessionId = String(body.sessionId || "").trim();
  const sessionId = /^[a-zA-Z0-9_-]{8,100}$/.test(requestedSessionId)
    ? requestedSessionId
    : `emp_${crypto.randomUUID()}`;
  const requestId = crypto.randomUUID();

  const scope = classifyBoudlAssistantScope(message);
  if (scope !== "in_scope") {
    return json({
      reply: boudlScopeReply(scope),
      sources: [],
      sessionId,
      requestId,
      provider: "bhg-scope-fast-path",
      scope: BHG_ASSISTANT_SCOPE,
    });
  }

  const [sources, openAiAvailable] = await Promise.all([
    lookupOfficialBoudlSources(message).catch((error) => {
      console.error("[employee-agent] Boudl lookup failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
      return [] as OfficialSource[];
    }),
    isOpenAiAvailable().catch(() => false),
  ]);

  if (n8nAgentConfigured()) {
    try {
      const result = await callN8nAgent({
        version: 1,
        type: "employee_assist",
        requestId,
        sessionId,
        actor: { type: "employee", scope: "public-operations" },
        message,
        sourcePolicy: {
          officialDomainFirst: true,
          allowedDomains: ["boudl.com", "booking.boudl.com"],
          requireSourceForPropertyFacts: true,
        },
        officialSources: sources,
        allowedActions: ["answer", "branch_lookup", "policy_lookup", "create_support_request"],
        forbiddenActions: ["deploy", "run_code", "change_credentials", "modify_booking", "delete_data"],
      }, { timeoutMs: 12_000 });
      const safeSources = safeReturnedSources(result.data, sources);
      if (result.reply) {
        return json({
          reply: result.reply.slice(0, 6_000),
          sources: safeSources,
          sessionId,
          requestId,
          provider: "n8n",
          scope: BHG_ASSISTANT_SCOPE,
        });
      }
    } catch (error) {
      console.error("[employee-agent] n8n failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
    }
  }

  if (openAiAvailable && sources.length) {
    try {
      const evidence = sources
        .map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${source.snippet}`)
        .join("\n\n");
      const result = await generateOpenAiText({
        instructions: [
          "أنت مساعد موظفي الحجز المركزي في مجموعة بودل للضيافة.",
          "نطاقك حصريًا فنادق وعلامات المجموعة: بودل، بريرا، عابر، نارسيس وزمن. ارفض أي موضوع خارج هذا النطاق.",
          "مهمتك الإجابة عن معلومات الفروع والخدمات والموقع والسياسات العامة فقط.",
          "اعتمد فقط على النصوص الرسمية المرسلة لك من boudl.com أو booking.boudl.com.",
          "إذا لم تدعم المصادر الإجابة، قل بوضوح إن المعلومة غير مؤكدة ولا تخمن.",
          "لا تعرض أسعارًا من الذاكرة لأنها متغيرة، ولا تنفذ أي تعديل على حجوزات أو أنظمة.",
          "أجب بالعربية بوضوح واختصار واذكر اسم المصدر الرسمي في نهاية الإجابة.",
        ].join(" "),
        input: `سؤال الموظف: ${message}\n\nالمصادر الرسمية:\n${evidence}`,
        maxOutputTokens: 700,
        reasoningEffort: "none",
        timeoutMs: 18_000,
      });
      return json({
        reply: result.text,
        sources,
        sessionId,
        requestId,
        provider: "openai-fallback",
        scope: BHG_ASSISTANT_SCOPE,
      });
    } catch (error) {
      console.error("[employee-agent] OpenAI fallback failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
    }
  }

  return json({
    reply: fallbackFromSources(sources),
    sources,
    sessionId,
    requestId,
    provider: "official-source-fallback",
    scope: BHG_ASSISTANT_SCOPE,
  });
};

export const config: Config = {
  path: "/api/employee/agent",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
