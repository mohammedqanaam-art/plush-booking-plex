import { useEffect, useRef, useState } from "react";
import { Bot, ExternalLink, Send, Sparkles, X } from "lucide-react";
import { useVisitorAssistant } from "@/hooks/useVisitorAssistant";

const starters = [
  "أقرب فنادق BHG لبرج المملكة؟",
  "ما الخدمات المتوفرة في بودل العليا؟",
  "كيف أحجز من الموقع الرسمي؟",
];

const initialMessage = "أهلًا بك في مجموعة BHG. أساعدك في فنادق بودل، عابر، بريرا، نارسس وزمن: الفروع والمواقع والخدمات والحجز من المصادر المعتمدة.";

const officialHref = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["boudl.com", "www.boudl.com", "booking.boudl.com"].includes(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const VisitorAnswer = ({ text }: { text: string }) => {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https:\/\/[^)\s]+\))/g);
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((part, index) => {
        const bold = part.match(/^\*\*([^*\n]+)\*\*$/);
        if (bold) return <strong key={`${index}-${part}`}>{bold[1]}</strong>;
        const markdownLink = part.match(/^\[([^\]\n]+)\]\((https:\/\/[^)\s]+)\)$/);
        if (markdownLink) {
          const href = officialHref(markdownLink[2]);
          return href ? (
            <a key={`${index}-${part}`} href={href} target="_blank" rel="noreferrer" className="visitor-answer-link">
              {markdownLink[1]} <ExternalLink className="inline h-3.5 w-3.5" />
            </a>
          ) : <span key={`${index}-${part}`}>{markdownLink[1]}</span>;
        }
        return <span key={`${index}-${part}`}>{part}</span>;
      })}
    </div>
  );
};

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
        aria-label={open ? "إغلاق مساعد BHG" : "فتح مساعد BHG"}
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        <span className="hidden sm:inline">اسأل BHG</span>
      </button>

      {open ? (
        <section className="visitor-chat-panel" aria-label="مساعد BHG الذكي">
          <header className="visitor-chat-header">
            <div className="visitor-chat-avatar"><Bot className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <strong>مساعد BHG الذكي</strong>
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
                    <div>
                      <VisitorAnswer text={item.content} />
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
              aria-label="سؤالك لمساعد BHG"
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
