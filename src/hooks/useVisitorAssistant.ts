import { useCallback, useEffect, useRef, useState } from "react";
import {
  localAssistantReply,
  streamVisitorAssistant,
  warmVisitorAssistant,
  type VisitorChatTurn,
  type VisitorSource,
  type VisitorStreamStage,
} from "@/lib/visitorAssistantClient";

export type AssistantChatItem = VisitorChatTurn & {
  id: string;
  pending?: boolean;
  sources?: VisitorSource[];
};

const stageLabels: Record<VisitorStreamStage | "streaming", string> = {
  preparing: "جارٍ تجهيز المساعد…",
  cache: "أبحث عن إجابة فورية…",
  sources: "أراجع مصادر بودل الرسمية…",
  generating: "GPT‑5.6 Sol يصيغ الإجابة…",
  fallback: "أجهز أفضل إجابة متاحة…",
  streaming: "تصل الإجابة الآن…",
};

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const useVisitorAssistant = (options: {
  initialMessage: string;
  autoWarm?: boolean;
  endpoint?: string;
  sessionPrefix?: "visitor" | "employee";
}) => {
  const endpoint = options.endpoint || "/api/visitor/agent";
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(stageLabels.preparing);
  const [modelLabel, setModelLabel] = useState("GPT‑5.6 Sol");
  const [sessionId, setSessionId] = useState(() => `${options.sessionPrefix || "visitor"}_${crypto.randomUUID()}`);
  const [items, setItems] = useState<AssistantChatItem[]>(() => [{
    id: newId("welcome"),
    role: "assistant",
    content: options.initialMessage,
  }]);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (options.autoWarm) void warmVisitorAssistant(endpoint);
  }, [endpoint, options.autoWarm]);

  const warm = useCallback(() => {
    void warmVisitorAssistant(endpoint);
  }, [endpoint]);

  const send = useCallback(async (value?: string) => {
    const text = String(value ?? message).trim();
    if (!text || sendingRef.current) return;

    const history = items.slice(-10).map(({ role, content }) => ({ role, content }));
    const userId = newId("user");
    const assistantId = newId("assistant");
    const localReply = localAssistantReply(text, history);

    setMessage("");
    setItems((current) => [
      ...current,
      { id: userId, role: "user", content: text },
      {
        id: assistantId,
        role: "assistant",
        content: localReply || "",
        pending: !localReply,
        sources: [],
      },
    ]);
    if (localReply) return;

    sendingRef.current = true;
    setLoading(true);
    setStatus(stageLabels.preparing);

    try {
      const result = await streamVisitorAssistant(
        { message: text, sessionId, history },
        {
          onStatus: (stage) => setStatus(stageLabels[stage] || stageLabels.preparing),
          onDelta: (delta) => {
            setStatus(stageLabels.streaming);
            setItems((current) => current.map((item) => item.id === assistantId
              ? { ...item, content: item.content + delta }
              : item));
          },
        },
        { endpoint },
      );

      if (result.sessionId) setSessionId(result.sessionId);
      if (result.model?.toLowerCase().includes("gpt-5.6")) setModelLabel("GPT‑5.6 Sol");
      else if (result.provider === "n8n-agent") setModelLabel("BHG AI · n8n");
      setItems((current) => current.map((item) => item.id === assistantId
        ? {
            ...item,
            content: item.content || result.reply || "لم أجد إجابة مؤكدة الآن.",
            pending: false,
            sources: result.sources,
          }
        : item));
    } catch {
      setItems((current) => current.map((item) => item.id === assistantId
        ? {
            ...item,
            content: item.content || "تعذر الوصول للمساعد الآن. جرّب مرة أخرى بعد قليل أو استخدم صفحة الفروع والبحث داخل الموقع.",
            pending: false,
          }
        : item));
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }, [endpoint, items, message, sessionId]);

  return {
    canSend: Boolean(message.trim()) && !loading,
    items,
    loading,
    message,
    modelLabel,
    send,
    setMessage,
    status,
    warm,
  };
};
