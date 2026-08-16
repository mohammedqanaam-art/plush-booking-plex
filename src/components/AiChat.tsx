import { useEffect, useRef, useState } from "react";
import { Bot, Code2, Play, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { runAgentCommand } from "@/lib/agentApi";

type Message = { role: "user" | "assistant"; content: string };

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

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const data = await api.sendChatMessage(text, sessionId, history);
      if (data.sessionId) setSessionId(data.sessionId);
      appendResult(data.reply || "...");
    } catch (err) {
      console.error("[AiChat] sendChatMessage error:", err);
      const errorMessage = err instanceof Error && err.message
        ? err.message.slice(0, 240)
        : "حدث خطأ أثناء الاتصال بالمساعد.";
      appendResult(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const createDevelopmentRequest = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!window.confirm("إرسال هذا الطلب إلى n8n كطلب تطوير معتمد؟")) return;

    setMessages((prev) => [...prev, { role: "user", content: `طلب تطوير: ${text}` }]);
    setInput("");
    setLoading(true);
    try {
      const result = await runAgentCommand({
        action: "create_development_request",
        reason: text,
        payload: { request: text },
        confirm: true,
      });
      appendResult(result.reply);
    } catch (error) {
      appendResult(error instanceof Error ? error.message : "تعذر إرسال طلب التطوير إلى n8n.");
    } finally {
      setLoading(false);
    }
  };

  const runEmployeeSupportWorkflow = async () => {
    const text = input.trim() || "تشغيل مسار دعم الموظفين ومراجعة آخر طلب تشغيلي.";
    if (loading) return;
    if (!window.confirm("تشغيل Workflow دعم الموظفين في n8n الآن؟")) return;

    setMessages((prev) => [...prev, { role: "user", content: `تشغيل Workflow: ${text}` }]);
    setInput("");
    setLoading(true);
    try {
      const result = await runAgentCommand({
        action: "run_workflow",
        workflowKey: "employee-support",
        reason: text,
        payload: { request: text },
        confirm: true,
      });
      appendResult(result.reply);
    } catch (error) {
      appendResult(error instanceof Error ? error.message : "تعذر تشغيل Workflow في n8n.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "إغلاق المساعد الذكي" : "فتح المساعد الذكي"}
        className="fixed bottom-20 left-4 z-50 w-12 h-12 rounded-full gold-gradient text-primary-foreground shadow-lg flex items-center justify-center transition-transform hover:scale-105"
      >
        {open ? <X className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </button>

      {open && (
        <div className="fixed bottom-36 left-4 z-50 w-80 sm:w-96 max-h-[66vh] flex flex-col rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border gold-gradient text-primary-foreground">
            <Bot className="w-5 h-5 shrink-0" />
            <span className="font-semibold text-sm">المساعد الذكي · n8n</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.length === 0 && (
              <p className="text-center text-muted-foreground text-xs py-6">
                اسأل عن التشغيل، أو اكتب طلب تطوير ثم استخدم زر «طلب تطوير» لإرساله إلى n8n.
              </p>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[86%] px-3 py-2 rounded-xl whitespace-pre-wrap ${
                    message.role === "user"
                      ? "gold-gradient text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-secondary text-muted-foreground px-3 py-2 rounded-xl rounded-bl-sm text-xs animate-pulse">
                  جارٍ التنفيذ...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="grid grid-cols-2 gap-2 px-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => void createDevelopmentRequest()}
              disabled={!input.trim() || loading}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary text-xs font-semibold disabled:opacity-40"
            >
              <Code2 className="w-4 h-4" /> طلب تطوير
            </button>
            <button
              type="button"
              onClick={() => void runEmployeeSupportWorkflow()}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary text-xs font-semibold disabled:opacity-40"
            >
              <Play className="w-4 h-4" /> تشغيل دعم الموظفين
            </button>
          </div>

          <form
            className="flex items-center gap-2 px-3 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              className="flex-1 h-9 rounded-lg bg-secondary border border-border px-3 text-sm focus:outline-none"
              placeholder="اكتب سؤالك أو أمر التطوير..."
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 4000))}
              disabled={loading}
              dir="auto"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="إرسال"
              className="w-9 h-9 rounded-lg gold-gradient text-primary-foreground flex items-center justify-center disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default AiChat;
