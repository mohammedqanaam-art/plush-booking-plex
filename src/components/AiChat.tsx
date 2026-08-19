import { useEffect, useRef, useState } from "react";
import { Bot, Code2, ExternalLink, Play, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { runAgentCommand } from "@/lib/agentApi";

type Source = { title: string; url: string; snippet?: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[]; cacheHit?: boolean };

const friendlyError = (error: unknown, fallback: string) => {
  if (!(error instanceof Error)) return fallback;
  if (/allow-listed/i.test(error.message)) return "المسار التشغيلي غير مفعّل في إعدادات الخادم. تمت مزامنة قائمة المسارات؛ حدّث الصفحة وأعد المحاولة.";
  if (/Unauthorized/i.test(error.message)) return "انتهت جلسة الإدارة. سجّل الدخول مجددًا ثم أعد المحاولة.";
  return error.message.slice(0, 260) || fallback;
};

const AiChat = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const appendResult = (reply: string, sources: Source[] = [], cacheHit = false) => {
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: reply || "تم استلام الطلب.",
      sources,
      cacheHit,
    }]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const history = messages.map((message) => ({ role: message.role, content: message.content }));
      const data = await api.sendChatMessage(text, sessionId, history);
      if (data.sessionId) setSessionId(data.sessionId);
      appendResult(data.reply || "...", Array.isArray(data.sources) ? data.sources : [], Boolean(data.cacheHit));
    } catch (error) {
      appendResult(friendlyError(error, "حدث خطأ أثناء الاتصال بالمساعد."));
    } finally {
      setLoading(false);
    }
  };

  const createDevelopmentRequest = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!window.confirm("تسجيل الطلب في قائمة التطوير التشغيلية وإرساله لمسار Agent/n8n؟")) return;
    setMessages((prev) => [...prev, { role: "user", content: `طلب تطوير: ${text}` }]);
    setInput("");
    setLoading(true);
    try {
      const result = await runAgentCommand({ action: "create_development_request", reason: text, payload: { request: text }, confirm: true });
      appendResult(result.reply);
    } catch (error) {
      appendResult(friendlyError(error, "تعذر تسجيل طلب التطوير."));
    } finally {
      setLoading(false);
    }
  };

  const runEmployeeSupportWorkflow = async () => {
    const text = input.trim() || "تشغيل مسار دعم الموظفين والتحقق من مصادر BHG المعتمدة.";
    if (loading) return;
    if (!window.confirm("تشغيل مسار دعم الموظفين والتحقق من المصادر الرسمية الآن؟")) return;
    setMessages((prev) => [...prev, { role: "user", content: `دعم الموظفين: ${text}` }]);
    setInput("");
    setLoading(true);
    try {
      const result = await runAgentCommand({ action: "run_workflow", workflowKey: "employee-support", reason: text, payload: { request: text }, confirm: true });
      appendResult(result.reply);
    } catch (error) {
      appendResult(friendlyError(error, "تعذر تشغيل مسار دعم الموظفين."));
    } finally {
      setLoading(false);
    }
  };

  const refreshBranchKnowledge = async () => {
    if (loading) return;
    if (!window.confirm("تحديث فهرس معلومات الفروع من مصادر BHG المعتمدة في الخلفية الآن؟")) return;
    setMessages((prev) => [...prev, { role: "user", content: "تحديث معرفة فروع BHG" }]);
    setLoading(true);
    try {
      const result = await runAgentCommand({
        action: "refresh_branch_knowledge",
        workflowKey: "branch-knowledge-refresh",
        reason: "تحديث فهرس معلومات الفروع من مصادر BHG المعتمدة.",
        confirm: true,
      });
      appendResult(result.reply);
    } catch (error) {
      appendResult(friendlyError(error, "تعذر تحديث معرفة الفروع."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "إغلاق المساعد الذكي" : "فتح المساعد الذكي"}
        className="bhg-agent-toggle"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {open ? (
        <section className="bhg-agent-panel" aria-label="BHG Agent">
          <header className="bhg-agent-header">
            <div className="bhg-agent-header__identity">
              <span className="bhg-agent-header__icon"><Bot className="h-5 w-5" /></span>
              <div>
                <strong>BHG Operations Agent</strong>
                <small>Boudl.com · شيت BHG المنقّح · Booking المعتمد</small>
              </div>
            </div>
            <span className="bhg-agent-status">بوابة تشغيل</span>
          </header>

          <div className="bhg-agent-messages">
            {messages.length === 0 ? (
              <div className="bhg-agent-empty">
                <div>
                  <Bot className="mx-auto mb-3 h-7 w-7 text-primary/70" />
                  استفسر عن فروع BHG، شغّل دعم الموظفين، حدّث المعرفة المعتمدة، أو سجّل طلب تطوير.
                </div>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`bhg-agent-message-row bhg-agent-message-row--${message.role}`}>
                <div className={`bhg-agent-message bhg-agent-message--${message.role}`}>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.role === "assistant" && message.cacheHit ? (
                    <div className="mt-2 text-[10px] font-semibold text-emerald-700">إجابة من ذاكرة BHG السريعة</div>
                  ) : null}
                  {message.role === "assistant" && message.sources?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-primary/10 pt-2">
                      {message.sources.slice(0, 4).map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {source.title || "مصدر BHG"}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="bhg-agent-message-row bhg-agent-message-row--assistant">
                <div className="bhg-agent-message bhg-agent-message--assistant animate-pulse">جارٍ تجهيز الإجابة والتحقق…</div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="bhg-agent-actions">
            <button type="button" onClick={() => void createDevelopmentRequest()} disabled={!input.trim() || loading} className="bhg-agent-action">
              <Code2 className="h-4 w-4" /> طلب تطوير
            </button>
            <button type="button" onClick={() => void runEmployeeSupportWorkflow()} disabled={loading} className="bhg-agent-action">
              <Play className="h-4 w-4" /> دعم الموظفين
            </button>
            <button type="button" onClick={() => void refreshBranchKnowledge()} disabled={loading} className="bhg-agent-action">
              <RefreshCw className="h-4 w-4" /> تحديث الفروع
            </button>
          </div>

          <form className="bhg-agent-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <input
              placeholder="اكتب استفسارك أو طلب التطوير…"
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 4000))}
              disabled={loading}
              dir="auto"
              aria-label="رسالة إلى BHG Agent"
            />
            <button type="submit" disabled={!input.trim() || loading} aria-label="إرسال" className="bhg-agent-send disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
};

export default AiChat;
