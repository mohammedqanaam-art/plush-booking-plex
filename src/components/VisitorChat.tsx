import { useEffect, useRef, useState } from "react";
import { Bot, ExternalLink, Send, Sparkles, X } from "lucide-react";
import { useVisitorAssistant } from "@/hooks/useVisitorAssistant";

const starters = [
  "أقرب فروع بودل في الرياض؟",
  "ما الخدمات المتوفرة في بودل العليا؟",
  "كيف أحجز من الموقع الرسمي؟",
];

const initialMessage = "أهلًا بك في مجموعة بودل للضيافة. اسألني عن الفروع، المواقع، الخدمات، المرافق أو طريقة الحجز، وسأبحث لك في المصادر الرسمية عند الحاجة.";

const VisitorChat = () => {
  const [open, setOpen] = useState(false);
  const {
    canSend,
    items,
    loading,
    message,
    modelLabel,
    send,
    setMessage,
    status,
    warm,
  } = useVisitorAssistant({ initialMessage });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: loading ? "auto" : "smooth", block: "nearest" });
    }
  }, [items, loading, open, status]);

  const toggle = () => {
    warm();
    setOpen((value) => !value);
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        onPointerEnter={warm}
        onFocus={warm}
        className="visitor-chat-launcher"
        aria-label={open ? "إغلاق مساعد بودل" : "فتح مساعد بودل"}
        aria-expanded={open}
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
              <small>بث فوري · مصادر BHG الرسمية أولًا</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="visitor-chat-close" aria-label="إغلاق">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="visitor-chat-starters" aria-label="أسئلة سريعة">
            {starters.map((starter) => (
              <button key={starter} type="button" onClick={() => void send(starter)} disabled={loading}>
                {starter}
              </button>
            ))}
          </div>

          <div className="visitor-chat-messages custom-scrollbar" aria-live="polite" aria-busy={loading}>
            {items.map((item) => (
              <div key={item.id} className={`visitor-message visitor-message--${item.role}`}>
                <div className="visitor-message__bubble">
                  {item.pending && !item.content ? (
                    <div className="visitor-chat-typing">
                      <Sparkles className="h-4 w-4 animate-pulse" /> {status}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {item.content}
                      {item.pending ? <span className="ms-1 animate-pulse text-primary" aria-hidden="true">▍</span> : null}
                    </div>
                  )}
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
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (canSend) void send();
                }
              }}
              placeholder="اكتب سؤالك عن أي فرع أو خدمة…"
              aria-label="سؤالك لمساعد بودل"
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
