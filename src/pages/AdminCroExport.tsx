import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  CalendarDays,
  Clock3,
  DatabaseZap,
  Download,
  ExternalLink,
  Loader2,
  Power,
  Save,
  Settings2,
  RefreshCw,
  Wifi,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Switch } from "@/components/ui/switch";

type CroExportStatus = {
  loginUrl: string;
  dashboardUrl?: string;
  configured: boolean;
  exportConfigured: boolean;
  requiredEnv: string[];
};

type CroSyncStatus = {
  state: "idle" | "queued" | "running" | "success" | "error";
  source?: "manual" | "automatic";
  from?: string;
  to?: string;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  stats?: {
    total: number;
    confirmed: number;
    cancelled: number;
    cancelRate: number;
    updatedAt: string;
  };
};

type CroSyncResponse = {
  status: CroSyncStatus;
  automation: {
    configured: boolean;
    enabled: boolean;
    intervalMinutes: 30 | 60 | 120 | 360;
    mode: "rolling-month" | "fixed";
    from: string;
    to: string;
    schedule: string;
    nextRunAt?: string | null;
    updatedAt?: string | null;
    updatedBy?: string | null;
  };
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const now = new Date();
const defaultFrom = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
const defaultTo = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
const API_BASE = "/.netlify/functions";
const authHeaders = (): Record<string, string> => {
  const token = typeof window === "undefined" ? null : sessionStorage.getItem("admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const readError = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => ({}));
  return data.error || fallback;
};

const syncStateLabel: Record<CroSyncStatus["state"], string> = {
  idle: "جاهز للمزامنة",
  queued: "بانتظار التنفيذ",
  running: "جاري تحديث الحجوزات",
  success: "تمت المزامنة بنجاح",
  error: "تحتاج المزامنة مراجعة",
};

const formatTimestamp = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(date);
};

const formatTime = (value?: string | null) => {
  if (!value) return "أقرب موعد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "أقرب موعد";
  return new Intl.DateTimeFormat("ar-SA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(date);
};

const AdminCroExport = () => {
  const automationHydrated = useRef(false);
  const [status, setStatus] = useState<CroExportStatus | null>(null);
  const [sync, setSync] = useState<CroSyncResponse | null>(null);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [autoInterval, setAutoInterval] = useState<30 | 60 | 120 | 360>(30);
  const [autoMode, setAutoMode] = useState<"rolling-month" | "fixed">("rolling-month");
  const [autoFrom, setAutoFrom] = useState(defaultFrom);
  const [autoTo, setAutoTo] = useState(defaultTo);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"status" | "test" | "export" | "sync" | "archive" | "automation" | "">("status");

  const credentialsReady = Boolean(status?.configured || (username.trim() && password));
  const syncIsActive = sync?.status.state === "queued" || sync?.status.state === "running";
  const busy = Boolean(loading) || syncIsActive;
  const syncTone = useMemo(() => {
    if (sync?.status.state === "success") return "text-emerald-700";
    if (sync?.status.state === "error") return "text-red-700";
    if (syncIsActive) return "text-amber-700";
    return "text-foreground";
  }, [sync?.status.state, syncIsActive]);

  const loadSyncStatus = useCallback(async () => {
    const response = await fetch(`${API_BASE}/cro-sync`, { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "تعذر تحميل حالة المزامنة"));
    const result = await response.json() as CroSyncResponse;
    setSync(result);
    if (!automationHydrated.current) {
      setAutoEnabled(result.automation.enabled !== false);
      setAutoInterval(result.automation.intervalMinutes || 30);
      setAutoMode(result.automation.mode || "rolling-month");
      setAutoFrom(result.automation.from || defaultFrom);
      setAutoTo(result.automation.to || defaultTo);
      automationHydrated.current = true;
    }
    return result;
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/cro-export`, { headers: authHeaders() }).then(async (response) => {
        if (!response.ok) throw new Error(await readError(response, "تعذر تحميل حالة CRO"));
        setStatus(await response.json() as CroExportStatus);
      }),
      loadSyncStatus(),
    ])
      .catch((error) => setMessage(error instanceof Error ? error.message : "تعذر تحميل حالة CRO"))
      .finally(() => setLoading(""));
  }, [loadSyncStatus]);

  useEffect(() => {
    if (!syncIsActive) return undefined;
    const timer = window.setInterval(() => {
      void loadSyncStatus()
        .then((result) => {
          if (result.status.state === "success") {
            setLoading("");
            setPassword("");
            setMessage(result.status.message || "تم تحديث تقارير الحجوزات من CRO.");
          } else if (result.status.state === "error") {
            setLoading("");
            setMessage(result.status.message || "تعذر تحديث التقارير من CRO.");
          }
        })
        .catch((error) => {
          setLoading("");
          setMessage(error instanceof Error ? error.message : "تعذر متابعة حالة التحديث.");
        });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [loadSyncStatus, syncIsActive]);

  const testLogin = async () => {
    setLoading("test");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/cro-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ dryRun: true, username, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "تعذر اختبار تسجيل الدخول في CRO");
      setMessage(result.message || "تم اختبار الاتصال.");
      setStatus((current) => current ? { ...current, exportConfigured: Boolean(result.exportReady) } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر اختبار الاتصال.");
    } finally {
      setLoading("");
    }
  };

  const startSync = async (archiveOnly: boolean) => {
    setLoading(archiveOnly ? "archive" : "sync");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/cro-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ from, to, username, password, archiveOnly }),
      });
      const result = await response.json().catch(() => ({})) as CroSyncResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر بدء مزامنة الحجوزات");
      setSync(result);
      setMessage(result.status.message || (archiveOnly ? "بدأت أرشفة الفترة في الخلفية." : "بدأ تحديث التقرير في الخلفية."));
    } catch (error) {
      setLoading("");
      setMessage(error instanceof Error ? error.message : "تعذر بدء المزامنة.");
    }
  };

  const saveAutomation = async () => {
    setLoading("automation");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/cro-sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          enabled: autoEnabled,
          intervalMinutes: autoInterval,
          mode: autoMode,
          from: autoFrom,
          to: autoTo,
        }),
      });
      const result = await response.json().catch(() => ({})) as CroSyncResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر حفظ تحكم المزامنة.");
      setSync(result);
      setAutoEnabled(result.automation.enabled);
      setAutoInterval(result.automation.intervalMinutes);
      setAutoMode(result.automation.mode);
      setAutoFrom(result.automation.from);
      setAutoTo(result.automation.to);
      setMessage(result.automation.enabled
        ? `تم تشغيل مزامنة CRO كل ${result.automation.intervalMinutes} دقيقة.`
        : "تم إيقاف مزامنة CRO التلقائية وزر التحديث العام.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ تحكم المزامنة.");
    } finally {
      setLoading("");
    }
  };

  const exportBookings = async () => {
    setLoading("export");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/cro-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ from, to, username, password }),
      });
      if (!response.ok) throw new Error(await readError(response, "تعذر تصدير الحجوزات من CRO"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cro-bookings-${from}-to-${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("تم تنزيل ملف حجوزات CRO.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تصدير الحجوزات.");
    } finally {
      setLoading("");
    }
  };

  return (
    <div className="page-wrap-narrow">
      <PageHeader title="مزامنة الحجوزات" icon={RefreshCw} />

      {message ? <div aria-live="polite" className="rounded-2xl border border-primary/20 bg-primary/8 p-4 text-sm leading-7">{message}</div> : null}

      <section className="relative overflow-hidden rounded-[1.75rem] border border-primary/15 bg-gradient-to-br from-primary/15 via-background to-secondary/55 p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -left-20 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div role="img" aria-label="أيقونة مزامنة الحجوزات" className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-background/85 shadow-sm backdrop-blur">
              <RefreshCw className={`h-7 w-7 text-primary ${syncIsActive ? "animate-spin" : ""}`} aria-hidden="true" />
              {sync?.automation.configured ? <span className="absolute -left-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" /> : null}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">المزامنة التلقائية</h2>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  sync?.automation.enabled && sync?.automation.configured
                    ? "bg-emerald-500/10 text-emerald-700"
                    : sync?.automation.configured
                      ? "bg-slate-500/10 text-slate-600"
                      : "bg-amber-500/10 text-amber-700"
                }`}>
                  {!sync?.automation.configured
                    ? "تحتاج إعداد"
                    : sync.automation.enabled
                      ? `مفعّلة · كل ${sync.automation.intervalMinutes} دقيقة`
                      : "متوقفة مؤقتًا"}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-64">
            <div className="rounded-2xl border border-border/40 bg-background/70 p-3 text-center backdrop-blur">
              <Clock3 className="mx-auto h-4 w-4 text-primary" />
              <span className="mt-1 block text-[11px] text-muted-foreground">المزامنة القادمة</span>
              <strong className="text-sm">{sync?.automation.enabled && sync?.automation.configured ? formatTime(sync.automation.nextRunAt) : "—"}</strong>
            </div>
            <div className="rounded-2xl border border-border/40 bg-background/70 p-3 text-center backdrop-blur">
              <Activity className="mx-auto h-4 w-4 text-primary" />
              <span className="mt-1 block text-[11px] text-muted-foreground">الحالة</span>
              <strong className={`text-sm ${syncTone}`}>{syncStateLabel[sync?.status.state || "idle"]}</strong>
            </div>
          </div>
        </div>

        <div className="relative mt-5 border-t border-border/35 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">آخر تحديث: <strong className="text-foreground">{formatTimestamp(sync?.status.stats?.updatedAt || sync?.status.finishedAt)}</strong></span>
            <span className="text-muted-foreground">الفترة الآلية: <strong className="text-foreground" dir="ltr">{sync?.automation.from || "—"} — {sync?.automation.to || "—"}</strong></span>
          </div>
        </div>
      </section>

      <section className="page-surface space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${autoEnabled ? "bg-emerald-500/12 text-emerald-700" : "bg-slate-500/10 text-slate-600"}`}>
              <Power className="h-5 w-5" />
            </span>
            <div>
              <h2 className="section-title">تحكم CRO</h2>
              <p className="mt-1 text-xs text-muted-foreground">الإيقاف يمنع الجدولة وزر التحديث العام، ويبقي التشغيل اليدوي للمشرف.</p>
            </div>
          </div>
          <label className="inline-flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 text-sm font-bold">
            <span>{autoEnabled ? "تشغيل" : "إيقاف"}</span>
            <Switch
              checked={autoEnabled}
              onCheckedChange={setAutoEnabled}
              aria-label="تشغيل مزامنة CRO"
              disabled={loading === "automation"}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1.5 flex items-center gap-1 text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> تكرار المزامنة</span>
            <select
              className="h-11 w-full rounded-xl border bg-secondary/40 px-3 font-bold outline-none focus:border-primary"
              value={autoInterval}
              onChange={(event) => setAutoInterval(Number(event.target.value) as 30 | 60 | 120 | 360)}
            >
              <option value={30}>كل 30 دقيقة</option>
              <option value={60}>كل ساعة</option>
              <option value={120}>كل ساعتين</option>
              <option value={360}>كل 6 ساعات</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1.5 flex items-center gap-1 text-muted-foreground"><Settings2 className="h-3.5 w-3.5" /> نطاق التحديث</span>
            <select
              className="h-11 w-full rounded-xl border bg-secondary/40 px-3 font-bold outline-none focus:border-primary"
              value={autoMode}
              onChange={(event) => setAutoMode(event.target.value as "rolling-month" | "fixed")}
            >
              <option value="rolling-month">الشهر الحالي تلقائيًا</option>
              <option value="fixed">فترة ثابتة</option>
            </select>
          </label>
        </div>

        {autoMode === "fixed" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1.5 block text-muted-foreground">من تاريخ Check-Out</span>
              <input type="date" className="h-11 w-full rounded-xl border bg-secondary/40 px-3" value={autoFrom} onChange={(event) => setAutoFrom(event.target.value)} />
            </label>
            <label className="text-xs">
              <span className="mb-1.5 block text-muted-foreground">إلى تاريخ Check-Out</span>
              <input type="date" className="h-11 w-full rounded-xl border bg-secondary/40 px-3" value={autoTo} onChange={(event) => setAutoTo(event.target.value)} />
            </label>
          </div>
        ) : null}

        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-xl gold-gradient px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          onClick={() => void saveAutomation()}
          disabled={loading === "automation" || (autoMode === "fixed" && (!autoFrom || !autoTo || autoFrom > autoTo))}
        >
          {loading === "automation" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ التحكم
        </button>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <div className="compact-card"><p className="text-xs text-muted-foreground">بيانات الدخول</p><strong className={status?.configured ? "text-emerald-600" : "text-amber-700"}>{status?.configured ? "محفوظة بأمان" : "إدخال مؤقت"}</strong></div>
        <div className="compact-card"><p className="text-xs text-muted-foreground">تصدير CRO</p><strong className={status?.exportConfigured ? "text-emerald-600" : "text-amber-700"}>{status?.exportConfigured ? "جاهز" : "ينقصه ضبط"}</strong></div>
        <div className="compact-card"><p className="text-xs text-muted-foreground">التكرار</p><strong>{sync?.automation.enabled && sync?.automation.configured ? `كل ${sync.automation.intervalMinutes} دقيقة` : "متوقف"}</strong></div>
      </section>

      {sync?.status.stats ? (
        <section className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="compact-card"><span className="block text-muted-foreground">الإجمالي</span><strong className="mt-1 block text-lg">{sync.status.stats.total.toLocaleString("ar-SA")}</strong></div>
          <div className="compact-card"><span className="block text-muted-foreground">المؤكدة</span><strong className="mt-1 block text-lg text-emerald-700">{sync.status.stats.confirmed.toLocaleString("ar-SA")}</strong></div>
          <div className="compact-card"><span className="block text-muted-foreground">الملغاة/عدم الحضور</span><strong className="mt-1 block text-lg text-red-700">{sync.status.stats.cancelled.toLocaleString("ar-SA")}</strong></div>
        </section>
      ) : null}

      <section className="page-surface space-y-5">
        <h2 className="section-title">مزامنة يدوية</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1.5 block text-muted-foreground">مستخدم CRO</span>
            <input dir="ltr" className="h-12 w-full rounded-2xl border bg-secondary/50 px-4 outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10" placeholder="اسم المستخدم" value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="text-xs">
            <span className="mb-1.5 block text-muted-foreground">كلمة المرور</span>
            <input dir="ltr" type="password" className="h-12 w-full rounded-2xl border bg-secondary/50 px-4 outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10" placeholder="••••••••" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1.5 flex items-center gap-1 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> من تاريخ Check-Out</span>
            <input type="date" className="h-12 w-full rounded-2xl border bg-secondary/50 px-4 outline-none focus:border-primary/60" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="text-xs">
            <span className="mb-1.5 flex items-center gap-1 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> إلى تاريخ Check-Out</span>
            <input type="date" className="h-12 w-full rounded-2xl border bg-secondary/50 px-4 outline-none focus:border-primary/60" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl gold-gradient px-4 text-sm font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void startSync(false)} disabled={busy || !credentialsReady || !status?.exportConfigured}>
            {loading === "sync" || syncIsActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />} تحديث التقرير الحالي
          </button>
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 px-4 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void startSync(true)} disabled={busy || !credentialsReady || !status?.exportConfigured}>
            {loading === "archive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} أرشفة فترة سابقة
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border/35 pt-4">
          <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/25 px-4 text-sm font-bold" onClick={() => void testLogin()} disabled={busy || !credentialsReady}>
            {loading === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} اختبار الدخول
          </button>
          <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/50 px-4 text-sm font-bold" onClick={() => void exportBookings()} disabled={busy || !credentialsReady || !status?.exportConfigured}>
            {loading === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تنزيل CSV فقط
          </button>
          {status?.dashboardUrl ? (
            <a className="inline-flex h-11 items-center gap-2 rounded-xl border border-border/35 px-4 text-sm font-bold" href={status.dashboardUrl} target="_blank" rel="noreferrer noopener">
              فتح CRO <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>

      </section>
    </div>
  );
};

export default AdminCroExport;
