import { redactSensitiveMessage } from "@/lib/redactSensitiveMessage";
import {
  boudlScopeReply,
  classifyBoudlAssistantScope,
} from "@/lib/boudlAssistantScope";

export type VisitorSource = { title: string; url: string; snippet?: string };
export type VisitorChatTurn = { role: "user" | "assistant"; content: string };
export type VisitorAgentResponse = {
  reply: string;
  sources: VisitorSource[];
  provider?: string;
  model?: string | null;
  sessionId?: string;
  requestId?: string;
  error?: string;
};

export type VisitorStreamStage = "preparing" | "cache" | "sources" | "generating" | "fallback";

export { redactSensitiveMessage } from "@/lib/redactSensitiveMessage";

const safeSources = (value: unknown): VisitorSource[] => Array.isArray(value)
  ? value.filter((source): source is VisitorSource => Boolean(
      source
      && typeof source === "object"
      && typeof source.title === "string"
      && typeof source.url === "string",
    )).slice(0, 6)
  : [];

export const localAssistantReply = (message: string, history: VisitorChatTurn[]) => {
  const scope = classifyBoudlAssistantScope(
    message,
    history.filter((item) => item.role === "user").map((item) => item.content),
  );
  return scope === "in_scope" ? null : boudlScopeReply(scope);
};

const warmPromises = new Map<string, Promise<void>>();
export const warmVisitorAssistant = (endpoint = "/api/visitor/agent") => {
  const current = warmPromises.get(endpoint);
  if (current) return current;
  const warmPromise = fetch(`${endpoint}?warm=1`, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    keepalive: true,
  }).then(() => undefined).catch(() => {
    warmPromises.delete(endpoint);
  });
  warmPromises.set(endpoint, warmPromise);
  return warmPromise;
};

const parseSseBlock = (block: string) => {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) as Record<string, unknown> };
  } catch {
    return null;
  }
};

export async function streamVisitorAssistant(
  request: { message: string; sessionId: string; history: VisitorChatTurn[] },
  handlers: {
    onDelta: (delta: string) => void;
    onStatus?: (stage: VisitorStreamStage) => void;
  },
  options: { endpoint?: string } = {},
): Promise<VisitorAgentResponse> {
  const protectedRequest = {
    ...request,
    message: redactSensitiveMessage(request.message),
    history: request.history.map((item) => ({ ...item, content: redactSensitiveMessage(item.content) })),
  };
  const response = await fetch(options.endpoint || "/api/visitor/agent", {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(protectedRequest),
    credentials: "same-origin",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as Partial<VisitorAgentResponse>;
    throw new Error(data.error || "تعذر تشغيل المساعد");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.body || !contentType.includes("text/event-stream")) {
    const data = await response.json() as Partial<VisitorAgentResponse>;
    const reply = String(data.reply || "").trim();
    if (!reply) throw new Error("تعذر الحصول على إجابة واضحة");
    handlers.onDelta(reply);
    return {
      ...data,
      reply,
      sources: safeSources(data.sources),
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let completed: Partial<VisitorAgentResponse> | undefined;
  let streamError = "";

  const processBlock = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    if (parsed.event === "delta" && typeof parsed.data.delta === "string") {
      reply += parsed.data.delta;
      handlers.onDelta(parsed.data.delta);
      return;
    }
    if (parsed.event === "status" && typeof parsed.data.stage === "string") {
      handlers.onStatus?.(parsed.data.stage as VisitorStreamStage);
      return;
    }
    if (parsed.event === "done") {
      completed = parsed.data as Partial<VisitorAgentResponse>;
      return;
    }
    if (parsed.event === "error") {
      streamError = String(parsed.data.error || "تعذر إكمال الإجابة الآن");
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) processBlock(block);
  }
  buffer += decoder.decode();
  if (buffer.trim()) processBlock(buffer);
  if (streamError) throw new Error(streamError);
  if (!completed || completed.error) throw new Error("لم تكتمل الإجابة. يرجى إعادة المحاولة.");

  const completedReply = String(completed?.reply || "").trim();
  if (!reply && completedReply) {
    reply = completedReply;
    handlers.onDelta(completedReply);
  } else if (completedReply.startsWith(reply) && completedReply.length > reply.length) {
    const tail = completedReply.slice(reply.length);
    reply += tail;
    handlers.onDelta(tail);
  }
  if (!reply.trim()) throw new Error(streamError || "تعذر الحصول على إجابة واضحة");

  return {
    ...completed,
    reply,
    sources: safeSources(completed?.sources),
  };
}
