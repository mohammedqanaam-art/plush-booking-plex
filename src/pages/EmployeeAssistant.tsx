import { useMemo, useState } from "react";
import { ExternalLink, MessageCircle, Send, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";

type Source = {
  title: string;
  url: string;
  snippet?: string;
};

type ChatItem = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const quickPrompts = [
  "ما الخدمات المتوفرة في بودل العليا؟",
  "اعطني فروع بودل في الرياض من الموقع الرسمي",
  "ما سياسة الإلغاء في بودل القصر؟",
  "هل يوجد جيم في بودل العليا؟",
];

const EmployeeAssistant = () => {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `emp_${crypto.randomUUID()}`);
  const [items, setItems] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "اسألني عن فروع بودل، الخدمات، الموقع، المرافق أو السياسات العامة. سأحاول الاعتماد على موقع Boudl.com الرسمي وإظهار المصدر مع الإجابة.",
    },
  ]);

  const canSend = useMemo(() => message.trim().length > 0 && !loading, [message, loading]);

  const send = async (value = message) => {
    const text = value.trim();
    if (!text || loading) return;
    setLoading(true);
    setMessage("");
    setItems((current) => [...current, { role: "user", content: text }]);

    try {
      const response = await fetch("/api/employee/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = await response.json().catch(() => ({})) as {
        reply?: string;
        sources?: Source[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "تعذر تشغيل المساعد");
      setItems((current) => [...current, {
        role: "assistant",
        content: data.reply || "لم أجد إجابة مؤكدة من المصدر الرسمي.",
        sources: Array.isArray(data.sources) ? data.sources : [],
      }]);
    } catch {
      setItems((current) => [...current, {
        role: "assistant",
        content: "تعذر الوصول للمساعد الآن. يمكنك المحاولة مرة أخرى أو فتح صفحة الفروع مباشرة.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrap-narrow space-y-4">
      <PageHeader title="مساعد الموظفين" icon={MessageCircle} />

      <section className="glass-card p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <span>معلومات الفروع تُدعّم بمصادر رسمية من Boudl.com متى كانت متاحة. المعلومات غير المدعومة لا يتم تقديمها كحقيقة مؤكدة.</span>
        </div>

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

        <div className="space-y-3 min-h-[360px] max-h-[58vh] overflow-y-auto custom-scrollbar rounded-2xl bg-secondary/20 p-3">
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
                <div className="mt-3 border-t border-border/60 pt-2 space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">المصادر الرسمية</div>
                  {item.sources.slice(0, 4).map((source) => (
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
              جاري البحث في المصادر الرسمية…
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
            onChange={(event) => setMessage(event.target.value.slice(0, 1_800))}
            placeholder="مثال: وش الخدمات الموجودة في بودل المونسية؟"
            rows={2}
            className="min-h-[52px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-xl gold-gradient text-primary-foreground disabled:opacity-50"
            aria-label="إرسال السؤال"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </section>
    </div>
  );
};

export default EmployeeAssistant;
