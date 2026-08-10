import { useEffect, useState } from "react";
import {
  Bot,
  Bug,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  Palette,
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

const displayTimestamp = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const AdminAiMaintenance = () => {
  const [status, setStatus] = useState<AiMaintenanceStatus | null>(null);
  const [focus, setFocus] = useState<AiMaintenanceFocus>("uno");
  const [request, setRequest] = useState("");
  const [review, setReview] = useState<AiMaintenanceReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    void load();
  }, []);

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
