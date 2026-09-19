import { useEffect, useState } from "react";
import {
  Bot,
  Bug,
  CheckCircle2,
  Clock3,
  Database,
  KeyRound,
  Loader2,
  Palette,
  Save,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import {
  api,
  type AiMaintenanceFocus,
  type AiMaintenanceReview,
  type AiMaintenanceStatus,
} from "@/lib/api";

const focusOptions: Array<{ value: AiMaintenanceFocus; label: string; icon: typeof Database }> = [
  { value: "uno", label: "UNO", icon: Database },
  { value: "security", label: "الأمان", icon: ShieldCheck },
  { value: "ui", label: "الواجهة", icon: Palette },
  { value: "errors", label: "الأخطاء", icon: Bug },
  { value: "custom", label: "تطوير مخصص", icon: Wrench },
];

const displayTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

type OpenAiConfigStatus = {
  configured: boolean;
  model: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
  storage?: string;
};

const AdminAiMaintenance = () => {
  const [status, setStatus] = useState<AiMaintenanceStatus | null>(null);
  const [focus, setFocus] = useState<AiMaintenanceFocus>("uno");
  const [request, setRequest] = useState("");
  const [review, setReview] = useState<AiMaintenanceReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openAi, setOpenAi] = useState<OpenAiConfigStatus | null>(null);
  const [openAiKey, setOpenAiKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState("");

  const load = async () => {
    try {
      const next = await api.getAiMaintenance();
      setStatus(next);
      setReview((current) => current || next.latest);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل الفحص الذكي.");
    }
  };

  const loadOpenAi = async () => {
    try {
      const response = await fetch("/api/admin/ai-config", { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as OpenAiConfigStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر قراءة إعداد OpenAI");
      setOpenAi(data);
    } catch (loadError) {
      setKeyMessage(loadError instanceof Error ? loadError.message : "تعذر قراءة إعداد OpenAI.");
    }
  };

  useEffect(() => {
    void load();
    void loadOpenAi();
  }, []);

  const saveOpenAiKey = async () => {
    const key = openAiKey.trim();
    if (!key || keyBusy) return;
    setKeyBusy(true);
    setKeyMessage("");
    try {
      const response = await fetch("/api/admin/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, model: "gpt-5.6-sol" }),
      });
      const data = await response.json().catch(() => ({})) as OpenAiConfigStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر حفظ إعداد OpenAI");
      setOpenAiKey("");
      setOpenAi(data);
      setKeyMessage("تم تفعيل GPT‑5.6 Sol وحفظ المفتاح داخل مخزن مشفّر. لن يتم عرضه مرة أخرى.");
    } catch (saveError) {
      setKeyMessage(saveError instanceof Error ? saveError.message : "تعذر حفظ إعداد OpenAI.");
    } finally {
      setKeyBusy(false);
    }
  };

  const runReview = async () => {
    if (!request.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.runAiMaintenance(focus, request.trim());
      setReview(next);
      setRequest("");
      await load();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "تعذر تنفيذ الفحص الذكي.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-wrap-narrow">
      <PageHeader title="مركز التطوير الذكي" icon={Sparkles} />

      <section className="grid grid-cols-3 gap-2">
        <article className="compact-card">
          <Bot className="h-4 w-4 text-primary" />
          <strong className="mt-2 block text-sm">{status?.configured ? "متصل" : "غير متصل"}</strong>
        </article>
        <article className="compact-card">
          <Clock3 className="h-4 w-4 text-primary" />
          <strong className="mt-2 block text-xs">{displayTimestamp(status?.latest?.createdAt)}</strong>
        </article>
        <article className="compact-card">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          <strong className="mt-2 block text-xs">اعتماد المشرف</strong>
        </article>
      </section>

      <section className="page-surface space-y-4 border-emerald-900/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="admin-tool-card__icon"><KeyRound className="h-5 w-5" /></span>
            <div>
              <h2 className="section-title">OpenAI · Visitor Agent</h2>
              <p className="mt-1 text-xs text-muted-foreground">GPT‑5.6 Sol · Responses API · Web Search لمصادر Boudl.com الرسمية.</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${openAi?.configured ? "status-success" : "status-warning"}`}>
            {openAi?.configured ? "مفعّل" : "يحتاج مفتاح"}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="password"
            autoComplete="off"
            value={openAiKey}
            onChange={(event) => setOpenAiKey(event.target.value.slice(0, 400))}
            placeholder="ألصق OpenAI API key هنا — لن يظهر بعد الحفظ"
            className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void saveOpenAiKey()}
            disabled={!openAiKey.trim() || keyBusy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {keyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            تفعيل GPT‑5.6
          </button>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-xl bg-secondary/35 p-3"><span className="text-muted-foreground">النموذج</span><strong className="mt-1 block" dir="ltr">{openAi?.model || "gpt-5.6-sol"}</strong></div>
          <div className="rounded-xl bg-secondary/35 p-3"><span className="text-muted-foreground">آخر تحديث</span><strong className="mt-1 block">{displayTimestamp(openAi?.updatedAt)}</strong></div>
          <div className="rounded-xl bg-secondary/35 p-3"><span className="text-muted-foreground">الحفظ</span><strong className="mt-1 block">{openAi?.storage === "encrypted-blob" ? "AES‑256‑GCM" : "إعداد الخادم"}</strong></div>
        </div>

        {keyMessage ? <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs font-semibold">{keyMessage}</div> : null}
      </section>

      <section className="page-surface space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {focusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`admin-tool-card min-h-[66px] ${focus === option.value ? "border-primary/55 bg-primary/5" : ""}`}
              onClick={() => setFocus(option.value)}
              aria-pressed={focus === option.value}
            >
              <span className="admin-tool-card__icon"><option.icon className="h-4 w-4" /></span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
        <textarea
          className="min-h-32 w-full rounded-2xl border bg-background p-3 text-sm"
          placeholder="اكتب التعديل أو الفحص المطلوب"
          value={request}
          onChange={(event) => setRequest(event.target.value.slice(0, 4_000))}
          disabled={busy || status?.configured === false}
        />
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-xl gold-gradient px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          onClick={() => void runReview()}
          disabled={busy || !request.trim() || status?.configured === false}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          فحص الآن
        </button>
      </section>

      {error ? <div role="alert" className="status-error rounded-xl border p-3 text-sm font-bold">{error}</div> : null}

      {review ? (
        <section className="page-surface space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{review.source === "daily" ? "الفحص اليومي" : "نتيجة الفحص"}</strong>
            <span className="text-xs text-muted-foreground">{displayTimestamp(review.createdAt)}</span>
          </div>
          <div className="whitespace-pre-wrap rounded-2xl bg-secondary/35 p-4 text-sm leading-7">{review.report}</div>
        </section>
      ) : null}
    </div>
  );
};

export default AdminAiMaintenance;
