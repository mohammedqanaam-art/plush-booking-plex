import { useEffect, useRef, useState } from "react";
import { Bot, Code2, Play, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { runAgentCommand } from "@/lib/agentApi";

type Message = { role: "user" | "assistant"; content: string };

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

  const appendResult = (reply: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content: reply || "تم استلام الطلب." }]);
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
      appendResult(data.reply || "...");
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
    const text = input.trim() || "تشغيل مسار دعم الموظفين والتحقق من مصادر Boudl.com الرسمية.";
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
    if (!window.confirm("تحديث فهرس معلومات الفروع من موقع Boudl.com الرسمي الآن؟")) return;
    setMessages((prev) => [...prev, { role: "user", content: "تحديث معرفة الفروع من Boudl.com" }]);
    setLoading(true);
    try {
      const result = await runAgentCommand({
        action: "refresh_branch_knowledge",
        workflowKey: "branch-knowledge-refresh",
        reason: "تحديث فهرس معلومات الفروع من المصادر الرسمية.",
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
                <small>n8n · Boudl.com · Secure Dispatcher</small>
              </div>
            </div>
            <span className="bhg-agent-status">بوابة تشغيل</span>
          </header>

          <div className="bhg-agent-messages">
            {messages.length === 0 ? (
              <div className="bhg-agent-empty">
                <div>
                  <Bot className="mx-auto mb-3 h-7 w-7 text-primary/70" />
                  استفسر عن الفروع، شغّل دعم الموظفين، حدّث معرفة Boudl.com، أو سجّل طلب تطوير.
                </div>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`bhg-agent-message-row bhg-agent-message-row--${message.role}`}>
                <div className={`bhg-agent-message bhg-agent-message--${message.role}`}>{message.content}</div>
              </div>
            ))}

            {loading ? (
              <div className="bhg-agent-message-row bhg-agent-message-row--assistant">
                <div className="bhg-agent-message bhg-agent-message--assistant animate-pulse">جارٍ التنفيذ والتحقق…</div>
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
