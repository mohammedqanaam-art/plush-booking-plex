import { useMemo, useState } from "react";
import { ExternalLink, MessageCircle, Send, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";

type Source = { title: string; url: string; snippet?: string };
type ChatItem = { role: "user" | "assistant"; content: string; sources?: Source[] };

const quickPrompts = [
  "ما فروع بودل في الرياض؟",
  "وش الخدمات الموجودة في بودل العليا؟",
  "كيف أحجز من الموقع الرسمي؟",
  "أحتاج فندق قريب من شمال الرياض",
];

const EmployeeAssistant = () => {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => `visitor_${crypto.randomUUID()}`);
  const [modelLabel, setModelLabel] = useState("BHG AI");
  const [items, setItems] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "أهلًا بك. أنا مساعد بودل الذكي؛ أقدر أساعدك في الفروع، المواقع، الخدمات، المرافق، السياسات العامة وطريقة الحجز، وأرجع للمصادر الرسمية عند الحاجة.",
    },
  ]);

  const canSend = useMemo(() => message.trim().length > 0 && !loading, [message, loading]);

  const send = async (value = message) => {
    const text = value.trim();
    if (!text || loading) return;
    const history = items.slice(-10).map((item) => ({ role: item.role, content: item.content }));
    setLoading(true);
    setMessage("");
    setItems((current) => [...current, { role: "user", content: text }]);

    try {
      const response = await fetch("/api/visitor/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, history }),
      });
      const data = await response.json().catch(() => ({})) as {
        reply?: string;
        sources?: Source[];
        error?: string;
        model?: string | null;
        provider?: string;
        sessionId?: string;
      };
      if (!response.ok) throw new Error(data.error || "تعذر تشغيل المساعد");
      if (data.sessionId) setSessionId(data.sessionId);
      if (data.model?.toLowerCase().includes("gpt-5.6")) setModelLabel("GPT‑5.6 Sol");
      else if (data.provider === "n8n-agent") setModelLabel("BHG AI · n8n");
      setItems((current) => [...current, {
        role: "assistant",
        content: data.reply || "لم أجد إجابة مؤكدة الآن.",
        sources: Array.isArray(data.sources) ? data.sources : [],
      }]);
    } catch {
      setItems((current) => [...current, {
        role: "assistant",
        content: "تعذر الوصول للمساعد الآن. جرّب مرة أخرى بعد قليل أو استخدم صفحة الفروع والبحث داخل الموقع.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrap-narrow space-y-4">
      <PageHeader title="مساعد بودل الذكي" icon={MessageCircle} />

      <section className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-l from-emerald-950 to-emerald-800 px-4 py-4 text-white md:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <strong className="block text-sm">خدمة ذكية للزوار والموظفين</strong>
              <span className="text-[11px] text-white/70">نطاق فنادق BHG فقط · المصادر الرسمية أولًا</span>
            </div>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold">{modelLabel}</span>
        </div>

        <div className="space-y-4 p-4 md:p-6">
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void send(prompt)}
                disabled={loading}
                className="rounded-full border border-border bg-background px-3 py-2 text-xs text-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="min-h-[420px] max-h-[62vh] space-y-3 overflow-y-auto rounded-2xl bg-secondary/20 p-3 custom-scrollbar">
            {items.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                  item.role === "user"
                    ? "ms-auto bg-primary text-primary-foreground"
                    : "me-auto border border-border/70 bg-background text-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap">{item.content}</div>
                {item.role === "assistant" && item.sources?.length ? (
                  <div className="mt-3 space-y-1.5 border-t border-border/60 pt-2">
                    <div className="text-[11px] font-semibold text-muted-foreground">المصادر الرسمية</div>
                    {item.sources.slice(0, 5).map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary underline-offset-4 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>{source.title || "Boudl.com"}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {loading ? (
              <div className="me-auto rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground">
                جارٍ البحث والتفكير…
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 2_400))}
              placeholder="اسألني عن أي فرع، خدمة أو معلومة تحتاجها…"
              rows={2}
              className="min-h-[54px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              dir="auto"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex h-[54px] w-[54px] items-center justify-center rounded-xl gold-gradient text-primary-foreground disabled:opacity-50"
              aria-label="إرسال السؤال"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};

export default EmployeeAssistant;
