import { useEffect, useRef } from "react";
import { ExternalLink, MessageCircle, Send, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useVisitorAssistant } from "@/hooks/useVisitorAssistant";

const quickPrompts = [
  "ما فروع بودل في الرياض؟",
  "وش الخدمات الموجودة في بودل العليا؟",
  "كيف أحجز من الموقع الرسمي؟",
  "أحتاج فندق قريب من شمال الرياض",
];

const initialMessage = "أهلًا بك. أنا مساعد بودل الذكي؛ أقدر أساعدك في الفروع، المواقع، الخدمات، المرافق، السياسات العامة وطريقة الحجز، وأرجع للمصادر الرسمية عند الحاجة.";

const EmployeeAssistant = () => {
  const {
    canSend,
    items,
    loading,
    message,
    modelLabel,
    send,
    setMessage,
    status,
  } = useVisitorAssistant({ initialMessage, autoWarm: true });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: loading ? "auto" : "smooth", block: "nearest" });
    }
  }, [items, loading, status]);

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
              <span className="text-[11px] text-white/70">إجابات متدفقة · مصادر BHG الرسمية أولًا</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
            {modelLabel}
          </span>
        </div>

        <div className="space-y-4 p-4 md:p-6">
          <div className="flex flex-wrap gap-2" aria-label="أسئلة سريعة">
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

          <div
            className="min-h-[420px] max-h-[62vh] space-y-3 overflow-y-auto rounded-2xl bg-secondary/20 p-3 custom-scrollbar"
            aria-live="polite"
            aria-busy={loading}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                  item.role === "user"
                    ? "ms-auto bg-primary text-primary-foreground"
                    : "me-auto border border-border/70 bg-background text-foreground"
                }`}
              >
                {item.pending && !item.content ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    <span>{status}</span>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">
                    {item.content}
                    {item.pending ? <span className="ms-1 animate-pulse text-primary" aria-hidden="true">▍</span> : null}
                  </div>
                )}
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
            <div ref={bottomRef} />
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
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (canSend) void send();
                }
              }}
              placeholder="اسألني عن أي فرع، خدمة أو معلومة تحتاجها…"
              aria-label="سؤالك لمساعد بودل"
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
          <p className="text-center text-[10px] text-muted-foreground">Enter للإرسال · Shift + Enter لسطر جديد</p>
        </div>
      </section>
    </div>
  );
};

export default EmployeeAssistant;
