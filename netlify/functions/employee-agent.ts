import type { Config, Context } from "@netlify/functions";
import { BHG_ASSISTANT_SCOPE, boudlScopeReply, classifyBoudlAssistantScope } from "./_shared/boudlAssistantScope";
import { lookupOfficialBoudlSources, type OfficialSource } from "./_shared/boudl-knowledge";
import { buildEmployeeKnowledge, employeeGuideForModel, type EmployeeKnowledgeSource } from "./_shared/employeeKnowledge";
import { generateOpenAiText, generateOpenAiTextStream, isOpenAiAvailable, type OpenAiTextOptions } from "./_shared/openai";
import { consumeEmployeeQuota } from "./_shared/employeeQuota";
import { redactSensitiveText } from "./_shared/redaction";
import { json, requireSameOrigin, validateSession } from "./_shared/security";

type ChatTurn = { role: "user" | "assistant"; content: string };
type StreamStage = "preparing" | "sources" | "generating" | "fallback";
type EmployeePayload = { reply: string; sources: EmployeeKnowledgeSource[]; sessionId: string; requestId: string;
  provider: string; model: string | null; scope: typeof BHG_ASSISTANT_SCOPE };

const cleanText = (value: unknown, maxLength: number) => String(value || "")
  .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[مفتاح محجوب]")
  .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[بيانات دخول محجوبة]")
  .replace(/\b(password|api[_ -]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[محجوب]").trim().slice(0, maxLength);

const historyFromBody = (value: unknown): ChatTurn[] => Array.isArray(value)
  ? value.slice(-8).filter((item) => item && typeof item === "object").map((item) => item as Record<string, unknown>)
      .filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({
        role: item.role as ChatTurn["role"],
        content: redactSensitiveText(cleanText(item.content, 1_500), 1_500, { redactAllPhoneLike: true }),
      })).filter((item) => item.content)
  : [];

const uniqueSources = (...groups: Array<Array<EmployeeKnowledgeSource | OfficialSource>>) => {
  const map = new Map<string, EmployeeKnowledgeSource>();
  for (const group of groups) for (const source of group) {
    const url = String(source.url || "").trim();
    if (!url || map.has(url)) continue;
    map.set(url, { title: String(source.title || "مصدر BHG").slice(0, 180), url, snippet: source.snippet?.slice(0, 700) });
  }
  return [...map.values()].slice(0, 6);
};

const aiOptions = (message: string, history: ChatTurn[], localEvidence: string, official: OfficialSource[]): OpenAiTextOptions => ({
  instructions: ["أنت مساعد قرارات لموظفي الحجز المركزي في مجموعة بودل للضيافة BHG.",
    "وجّه الموظف عمليًا وفق المرجع المرفق وحدود الصلاحية، ولا تدّع تنفيذ إجراء أو اعتماد استثناء.",
    "في الشكوى أعطِ: تصنيف الأولوية، الإجراء الآن، جهة التصعيد وسببه، البيانات الناقصة، صياغة مقترحة للضيف، وما يجب توثيقه.",
    "لا تلوم الضيف أو الفرع، ولا تعد بخصم أو استرداد أو ترقية أو إعفاء دون اعتماد.",
    "أسعار بكج العرسان والخدمات تؤخذ فقط من بيانات الفرع المرفقة، مع تنبيه مختصر للتحقق قبل التأكيد لأنها متغيرة.",
    "إذا غاب اسم الفرع أو رقم الحجز أو مصدره أو التواريخ أو حالة السداد وكانت لازمة، اسأل عنها بوضوح ولا تخمن.",
    "OTA يعالج عبر المنصة، واختلاف UNO/CRO مع PMS يصعّد بعد توثيق النظامين.",
    "احمِ الخصوصية: لا تطلب بطاقة أو CVV أو OTP أو كلمة مرور، ولا تكرر بيانات شخصية غير لازمة.",
    "أجب بالعربية المهنية، مباشرة وقابلة للتطبيق، واختصر ما لم تتطلب الحالة تفصيلًا."].join(" "),
  input: [history.length ? `سياق المحادثة:\n${history.map((item) => `${item.role === "user" ? "الموظف" : "المساعد"}: ${item.content}`).join("\n")}` : "",
    `طلب الموظف: ${message}`, `مرجع الإجراءات:\n${employeeGuideForModel}`,
    localEvidence ? `بيانات تشغيلية مرتبطة بالسؤال:\n${localEvidence}` : "",
    official.length ? `مصادر رسمية إضافية:\n${official.map((source) => `${source.title}\n${source.url}\n${source.snippet}`).join("\n\n")}` : ""]
    .filter(Boolean).join("\n\n"), maxOutputTokens: 900, reasoningEffort: "none", timeoutMs: 20_000,
});

type StreamSender = (event: string, data: unknown) => void;
const eventStream = (run: (send: StreamSender) => Promise<void> | void) => {
  const encoder = new TextEncoder(); let active = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: StreamSender = (event, data) => { if (!active) return; try {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch { active = false; } };
      try { await run(send); } catch { send("error", { error: "تعذر إكمال الإجابة الآن" }); }
      finally { if (active) try { controller.close(); } catch { /* client closed */ } }
    }, cancel() { active = false; },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
};

export default async (req: Request, context?: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (!new Set(["superadmin", "admin", "editor"]).has(session.role)) return json({ error: "Read-only account" }, 403);
  if (req.method === "GET" && new URL(req.url).searchParams.get("warm") === "1") {
    const warm = isOpenAiAvailable().catch(() => false); if (context) context.waitUntil(warm); else void warm;
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const originError = requireSameOrigin(req); if (originError) return originError;
  if (Number(req.headers.get("content-length") || 0) > 32 * 1024) return json({ error: "Request too large" }, 413);
  let body: { message?: string; sessionId?: string; history?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }
  const message = redactSensitiveText(cleanText(body.message, 2_400), 2_400, { redactAllPhoneLike: true });
  if (!message) return json({ error: "message is required" }, 400);
  const withinQuota = await consumeEmployeeQuota(session.userId, {
    namespace: "agents", units: 1, minuteLimit: 12, dailyLimit: 300,
  }).catch(() => false);
  if (!withinQuota) return json({ error: "Agent quota exceeded" }, 429);
  const history = historyFromBody(body.history);
  const requestedSessionId = String(body.sessionId || "").trim();
  const sessionId = /^[a-zA-Z0-9_-]{8,100}$/.test(requestedSessionId) ? requestedSessionId : `employee_${crypto.randomUUID()}`;
  const requestId = crypto.randomUUID(); const wantsStream = req.headers.get("accept")?.includes("text/event-stream") || false;
  const scope = classifyBoudlAssistantScope(message, history.filter((item) => item.role === "user").map((item) => item.content));
  if (scope !== "in_scope") {
    const payload: EmployeePayload = { reply: boudlScopeReply(scope), sources: [], sessionId, requestId,
      provider: "bhg-scope-fast-path", model: null, scope: BHG_ASSISTANT_SCOPE };
    return wantsStream ? eventStream((send) => { send("delta", { delta: payload.reply }); send("done", payload); }) : json(payload);
  }
  const knowledge = buildEmployeeKnowledge(message);
  if (knowledge.fastReply) {
    const payload: EmployeePayload = { reply: knowledge.fastReply, sources: knowledge.sources, sessionId, requestId,
      provider: "bhg-employee-fast-path", model: null, scope: BHG_ASSISTANT_SCOPE };
    return wantsStream ? eventStream((send) => { send("delta", { delta: payload.reply }); send("done", payload); }) : json(payload);
  }
  const resolve = async (onStatus?: (stage: StreamStage) => void, onDelta?: (delta: string) => void): Promise<EmployeePayload> => {
    onStatus?.("preparing"); const openAiAvailable = await isOpenAiAvailable().catch(() => false);
    onStatus?.("sources"); const official = knowledge.hasLocalEvidence ? [] : await lookupOfficialBoudlSources(message).catch(() => []);
    const sources = uniqueSources(knowledge.sources, official);
    if (openAiAvailable) try {
      onStatus?.("generating"); const options = aiOptions(message, history, knowledge.evidence, official);
      const result = onDelta ? await generateOpenAiTextStream(options, onDelta) : await generateOpenAiText(options);
      return { reply: result.text, sources, sessionId, requestId, provider: "openai-responses", model: result.model, scope: BHG_ASSISTANT_SCOPE };
    } catch (error) { console.error("[employee-agent] OpenAI failed", { code: error instanceof Error ? error.message : "UNKNOWN" }); }
    onStatus?.("fallback");
    const reply = "لم أتمكن من صياغة التوجيه الآن. اجمع رقم الحجز والفرع والمصدر وبيانات التواصل والتواريخ والوقائع وما تم التحقق منه، ثم ارفع الحالة للمشرف المناوب دون تقديم وعد مالي أو نتيجة غير معتمدة.";
    onDelta?.(reply); return { reply, sources, sessionId, requestId, provider: "bhg-safe-fallback", model: null, scope: BHG_ASSISTANT_SCOPE };
  };
  if (wantsStream) return eventStream(async (send) => { send("meta", { sessionId, requestId });
    const payload = await resolve((stage) => send("status", { stage }), (delta) => send("delta", { delta })); send("done", payload); });
  return json(await resolve());
};

export const config: Config = { path: "/api/employee/agent", rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip"] } };
