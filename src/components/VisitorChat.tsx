import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ExternalLink, Hotel, Send, Sparkles, X } from "lucide-react";

type Source = { title: string; url: string; snippet?: string };
type ChatItem = { role: "user" | "assistant"; content: string; sources?: Source[] };
type AgentResponse = {
  reply?: string;
  sources?: Source[];
  provider?: string;
  model?: string | null;
  sessionId?: string;
  error?: string;
};

const starters = [
  "أقرب فروع بودل في الرياض؟",
  "ما الخدمات المتوفرة في بودل العليا؟",
  "كيف أحجز من الموقع الرسمي؟",
];

const VisitorChat = () => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [modelLabel, setModelLabel] = useState("AI");
  const [sessionId, setSessionId] = useState(() => `visitor_${crypto.randomUUID()}`);
  const [items, setItems] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "أهلًا بك في مجموعة بودل للضيافة. اسألني عن الفروع، المواقع، الخدمات، المرافق أو طريقة الحجز، وسأبحث لك في المصادر الرسمية عند الحاجة.",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, loading, open]);

  const canSend = useMemo(() => message.trim().length > 0 && !loading, [message, loading]);

  const send = async (value = message) => {
    const text = value.trim();
    if (!text || loading) return;
    const history = items.slice(-10).map((item) => ({ role: item.role, content: item.content }));
    setItems((current) => [...current, { role: "user", content: text }]);
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/visitor/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, history }),
      });
      const data = await response.json().catch(() => ({})) as AgentResponse;
      if (!response.ok) throw new Error(data.error || "تعذر تشغيل المساعد");
      if (data.sessionId) setSessionId(data.sessionId);
      if (data.model?.toLowerCase().includes("gpt-5.6")) setModelLabel("GPT‑5.6 Sol");
      else if (data.provider === "n8n-agent") setModelLabel("BHG AI");
      setItems((current) => [...current, {
        role: "assistant",
        content: data.reply || "تعذر الحصول على إجابة واضحة الآن.",
        sources: Array.isArray(data.sources) ? data.sources : [],
      }]);
    } catch {
      setItems((current) => [...current, {
        role: "assistant",
        content: "تعذر الوصول للمساعد الآن. جرّب مرة أخرى بعد قليل، أو استخدم صفحة الفروع للوصول للمعلومة مباشرة.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="visitor-chat-launcher"
        aria-label={open ? "إغلاق مساعد بودل" : "فتح مساعد بودل"}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        <span className="hidden sm:inline">اسأل بودل</span>
      </button>

      {open ? (
        <section className="visitor-chat-panel" aria-label="مساعد بودل الذكي">
          <header className="visitor-chat-header">
            <div className="visitor-chat-avatar"><Bot className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <strong>مساعد بودل الذكي</strong>
                <span className="visitor-chat-model">{modelLabel}</span>
              </div>
              <small>متاح للزوار · بدون تسجيل دخول</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="visitor-chat-close" aria-label="إغلاق">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="visitor-chat-starters">
            {starters.map((starter) => (
              <button key={starter} type="button" onClick={() => void send(starter)} disabled={loading}>
                {starter}
              </button>
            ))}
          </div>

          <div className="visitor-chat-messages custom-scrollbar">
            {items.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`visitor-message visitor-message--${item.role}`}>
                <div className="visitor-message__bubble">
                  <div className="whitespace-pre-wrap">{item.content}</div>
                  {item.role === "assistant" && item.sources?.length ? (
                    <div className="visitor-message__sources">
                      <span>مصادر رسمية</span>
                      {item.sources.slice(0, 4).map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {source.title || "Boudl.com"}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="visitor-message visitor-message--assistant">
                <div className="visitor-message__bubble visitor-chat-typing">
                  <Hotel className="h-4 w-4" /> جارٍ البحث والإجابة…
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form
            className="visitor-chat-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 2_400))}
              placeholder="اكتب سؤالك عن أي فرع أو خدمة…"
              rows={1}
              dir="auto"
            />
            <button type="submit" disabled={!canSend} aria-label="إرسال">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
};

export default VisitorChat;
