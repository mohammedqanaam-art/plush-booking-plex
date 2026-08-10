import { useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileDown,
  FileSpreadsheet,
  Loader2,
  MoonStar,
  PhoneMissed,
  RefreshCcw,
  Sunrise,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getAdminSession, hasPermission } from "@/lib/adminAuth";
import { formatAvayaClock, formatDuration } from "@/lib/avayaReportProcessor";
import {
  analyzeShiftStartTimecard,
  buildNightCoverage,
  exportMissedCallsExcel,
  exportMissedCallsPdf,
  filterMissedCalls,
  loadAbandonedCallsPdf,
  type AbandonedCallsReport,
  type ShiftStartTimecardResult,
} from "@/lib/shiftStartTools";

const SHORT_CALL_OPTIONS = [0, 15, 30, 45, 60];

const timeLabel = (timestamp: number) => {
  const value = formatAvayaClock(timestamp);
  const hour = new Date(timestamp).getUTCHours();
  return `${value.slice(0, 5)} ${hour < 12 ? "ص" : "م"}`;
};

const AdminShiftStartTools = () => {
  const session = getAdminSession();
  const timecardInput = useRef<HTMLInputElement | null>(null);
  const missedInput = useRef<HTMLInputElement | null>(null);
  const [timecardFileName, setTimecardFileName] = useState("");
  const [timecard, setTimecard] = useState<ShiftStartTimecardResult | null>(null);
  const [timecardBusy, setTimecardBusy] = useState(false);
  const [timecardError, setTimecardError] = useState("");
  const [missedFileName, setMissedFileName] = useState("");
  const [missedReport, setMissedReport] = useState<AbandonedCallsReport | null>(null);
  const [missedBusy, setMissedBusy] = useState(false);
  const [missedError, setMissedError] = useState("");
  const [shortThreshold, setShortThreshold] = useState(30);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const coverage = useMemo(() => buildNightCoverage(timecard?.entries || [], 5), [timecard]);
  const morningCoverage = coverage.filter((employee) => employee.status === "morning");
  const earlyCoverage = coverage.filter((employee) => employee.status === "early");
  const openNight = coverage.filter((employee) => employee.hasOpenSession);
  const finalCoverage = coverage[coverage.length - 1];
  const filteredMissed = useMemo(
    () => missedReport ? filterMissedCalls(missedReport, shortThreshold) : null,
    [missedReport, shortThreshold],
  );

  if (!session || !hasPermission(session.role, "upload")) return <Navigate to="/admin" replace />;

  const chooseTimecard = async (file?: File) => {
    if (!file) return;
    if (!/\.(?:pdf|xlsx)$/i.test(file.name)) {
      setTimecardError("ارفع Agent Time Card بصيغة PDF أو XLSX.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setTimecardError("حجم ملف Time Card يتجاوز 15 ميجابايت.");
      return;
    }
    setTimecardBusy(true);
    setTimecardError("");
    setTimecardFileName(file.name);
    try {
      setTimecard(await analyzeShiftStartTimecard(file));
    } catch (cause) {
      setTimecard(null);
      setTimecardError(cause instanceof Error ? cause.message : "تعذر تحليل Agent Time Card.");
    } finally {
      setTimecardBusy(false);
    }
  };

  const chooseMissedCalls = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLocaleLowerCase("en").endsWith(".pdf")) {
      setMissedError("ارفع تقرير Abandoned Calls الأصلي بصيغة PDF.");
      return;
    }
    setMissedBusy(true);
    setMissedError("");
    setMissedFileName(file.name);
    try {
      setMissedReport(await loadAbandonedCallsPdf(file));
    } catch (cause) {
      setMissedReport(null);
      setMissedError(cause instanceof Error ? cause.message : "تعذر تحليل Abandoned Calls.");
    } finally {
      setMissedBusy(false);
    }
  };

  const runExport = async (kind: "pdf" | "excel") => {
    if (!filteredMissed || !missedReport) return;
    setExporting(kind);
    setMissedError("");
    try {
      if (kind === "pdf") await exportMissedCallsPdf(filteredMissed, missedReport);
      else await exportMissedCallsExcel(filteredMissed, missedReport);
    } catch (cause) {
      setMissedError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف التصدير.");
    } finally {
      setExporting(null);
    }
  };

  const resetTimecard = () => {
    setTimecard(null);
    setTimecardFileName("");
    setTimecardError("");
    if (timecardInput.current) timecardInput.current.value = "";
  };

  const resetMissed = () => {
    setMissedReport(null);
    setMissedFileName("");
    setMissedError("");
    if (missedInput.current) missedInput.current.value = "";
  };

  return (
    <div className="page-wrap">
      <PageHeader title="مركز بداية الشفت" icon={MoonStar} />

      <section className="page-surface overflow-hidden border-primary/20 bg-gradient-to-l from-primary/8 via-background to-secondary/20">
        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-[11px] font-black text-primary"><Clock3 className="h-3.5 w-3.5" /> بداية دوام المشرف</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">من يغطي النايت؟ وما المكالمات التي تحتاج متابعة فعلية؟</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">ارفع Time Card لتظهر التغطية حتى الصباح، ثم ارفع Abandoned Calls لإخراج قائمة FALSE نظيفة من التكرار والمكالمات القصيرة.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-3"><p className="text-[11px] font-bold text-red-700 dark:text-red-300">أحمر</p><p className="mt-1 text-sm font-black">ينتهي قبل 5 ص</p></div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-3"><p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">أخضر</p><p className="mt-1 text-sm font-black">يمتد من 5 ص+</p></div>
          </div>
        </div>
      </section>

      <section className="page-surface space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><MoonStar className="h-5 w-5" /></span>
            <div><h2 className="section-title">1. تغطية موظفي النايت</h2><p className="mt-1 text-xs text-muted-foreground">Agent Time Card فقط - نهاية الموظف المتصل تُحسب على 9 ساعات فعلية مع فواصل إعادة الاتصال.</p></div>
          </div>
          {timecard ? <button type="button" onClick={resetTimecard} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/50 px-3 text-xs font-bold"><RefreshCcw className="h-3.5 w-3.5" /> تغيير الملف</button> : null}
        </div>

        {!timecard ? (
          <button type="button" disabled={timecardBusy} onClick={() => timecardInput.current?.click()} className="group flex min-h-36 w-full items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-secondary/15 p-5 text-center transition hover:border-primary/60 hover:bg-primary/5 disabled:opacity-55">
            <input ref={timecardInput} type="file" accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => void chooseTimecard(event.target.files?.[0])} />
            <span><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">{timecardBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}</span><strong className="mt-3 block text-sm">{timecardBusy ? "جارٍ تحليل الشفت…" : "رفع Agent Time Card"}</strong><small className="mt-1 block text-xs text-muted-foreground">{timecardFileName || "PDF أو XLSX"}</small></span>
          </button>
        ) : null}
        {timecardError ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 p-3 text-sm text-red-700 dark:text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {timecardError}</div> : null}

        {timecard ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <article className="compact-card"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">موظفو النايت</p><UsersRound className="h-4 w-4 text-primary" /></div><p className="mt-2 text-2xl font-black">{coverage.length.toLocaleString("ar-SA")}</p></article>
              <article className="compact-card border-red-500/20 bg-red-500/5"><div className="flex items-center justify-between"><p className="text-xs text-red-700 dark:text-red-300">ينتهون قبل 5 ص</p><AlertTriangle className="h-4 w-4 text-red-600" /></div><p className="mt-2 text-2xl font-black text-red-700 dark:text-red-300">{earlyCoverage.length.toLocaleString("ar-SA")}</p></article>
              <article className="compact-card border-emerald-500/20 bg-emerald-500/5"><div className="flex items-center justify-between"><p className="text-xs text-emerald-700 dark:text-emerald-300">تغطية 5 ص فأبعد</p><Sunrise className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{morningCoverage.length.toLocaleString("ar-SA")}</p></article>
              <article className="compact-card"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">متصلون الآن</p><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-2xl font-black">{openNight.length.toLocaleString("ar-SA")}</p><small className="text-[10px] text-muted-foreground">أبعد تغطية {finalCoverage ? timeLabel(finalCoverage.coverageEndTimestamp) : "—"}</small></article>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/45 custom-scrollbar">
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <thead className="bg-[#173e35] text-white"><tr>{["الموظف", "أول دخول", "مدة الدخول", "فواصل الاتصال", "نهاية التغطية", "الحساب", "الحالة"].map((header) => <th key={header} className="px-4 py-3 text-right text-xs font-black">{header}</th>)}</tr></thead>
                <tbody>
                  {coverage.map((employee) => {
                    const morning = employee.status === "morning";
                    return (
                      <tr key={employee.key} className={`border-b border-border/30 last:border-0 ${morning ? "bg-emerald-500/7" : "bg-red-500/7"}`}>
                        <td className="px-4 py-3"><strong className="block">{employee.name.replace(/\(\d+\)\s*$/, "")}</strong><small className="text-muted-foreground">{employee.employeeId || "بدون رقم"}</small></td>
                        <td className="px-4 py-3 font-mono" dir="ltr">{formatAvayaClock(employee.shiftStartTimestamp)}</td>
                        <td className="px-4 py-3 font-mono" dir="ltr">{formatDuration(employee.loggedInDurationSeconds)}</td>
                        <td className="px-4 py-3 font-mono" dir="ltr">{formatDuration(employee.disconnectedDurationSeconds)}</td>
                        <td className={`px-4 py-3 text-lg font-black ${morning ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{timeLabel(employee.coverageEndTimestamp)}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-secondary/70 px-2 py-1 text-[10px] font-bold">{employee.coverageEndKind === "projected" ? "متوقع - متصل" : "خروج فعلي"}</span></td>
                        <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${morning ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"}`}>{morning ? "يغطي الصباح" : "ينتهي مبكرًا"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!coverage.length ? <div className="p-8 text-center text-sm text-muted-foreground">لم يظهر في الملف موظفون تنتهي تغطيتهم بين 10 م و10 ص.</div> : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="page-surface space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-500/10 text-red-600"><PhoneMissed className="h-5 w-5" /></span>
            <div><h2 className="section-title">2. تنظيف المكالمات المفقودة</h2><p className="mt-1 text-xs text-muted-foreground">يحتفظ بـ FALSE فقط، ثم يقبل أرقام الجوال المحلية 05 / 5 فقط ويحذف القصير والمكرر.</p></div>
          </div>
          {missedReport ? <button type="button" onClick={resetMissed} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/50 px-3 text-xs font-bold"><RefreshCcw className="h-3.5 w-3.5" /> تغيير الملف</button> : null}
        </div>

        {!missedReport ? (
          <button type="button" disabled={missedBusy} onClick={() => missedInput.current?.click()} className="group flex min-h-36 w-full items-center justify-center rounded-2xl border border-dashed border-red-500/30 bg-red-500/4 p-5 text-center transition hover:border-red-500/60 hover:bg-red-500/7 disabled:opacity-55">
            <input ref={missedInput} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(event) => void chooseMissedCalls(event.target.files?.[0])} />
            <span><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-red-500/10 text-red-600">{missedBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}</span><strong className="mt-3 block text-sm">{missedBusy ? "جارٍ قراءة المكالمات…" : "رفع Abandoned Calls"}</strong><small className="mt-1 block text-xs text-muted-foreground">{missedFileName || "PDF الأصلي من Avaya"}</small></span>
          </button>
        ) : null}
        {missedError ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 p-3 text-sm text-red-700 dark:text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {missedError}</div> : null}

        {missedReport && filteredMissed ? (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {[
                  ["الإجمالي", filteredMissed.total, ""],
                  ["FALSE", filteredMissed.falseCalls, "text-sky-700 dark:text-sky-300"],
                  ["Answered محذوف", filteredMissed.answeredRemoved, "text-amber-700 dark:text-amber-300"],
                  ["رقم وهمي محذوف", filteredMissed.invalidPhoneRemoved, "text-red-700 dark:text-red-300"],
                  ["مكرر محذوف", filteredMissed.duplicateRemoved, "text-fuchsia-700 dark:text-fuchsia-300"],
                  ["القائمة النهائية", filteredMissed.calls.length, "text-emerald-700 dark:text-emerald-300"],
                ].map(([label, value, valueClass]) => <article key={String(label)} className="compact-card"><p className="text-[11px] text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-black ${valueClass}`}>{Number(value).toLocaleString("ar-SA")}</p></article>)}
              </div>
              <label className="block"><span className="mb-1.5 block text-[11px] font-black text-muted-foreground">حذف المكالمات الأقصر من</span><select value={shortThreshold} onChange={(event) => setShortThreshold(Number(event.target.value))} className="h-11 min-w-44 rounded-xl border border-border/50 bg-background px-3 text-sm font-bold outline-none focus:border-primary"><option value={0}>لا تحذف بالمدة</option>{SHORT_CALL_OPTIONS.filter(Boolean).map((seconds) => <option key={seconds} value={seconds}>{seconds} ثانية</option>)}</select></label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-secondary/20 p-3">
              <p className="text-xs text-muted-foreground">القصيرة المحذوفة: <strong className="text-foreground">{filteredMissed.shortRemoved.toLocaleString("ar-SA")}</strong> · الأرقام المقبولة تُوحّد إلى 05xxxxxxxx · وعند التكرار نحتفظ بأول مكالمة للحفاظ على أقدم وقت متابعة.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!!exporting || !filteredMissed.calls.length} onClick={() => void runExport("pdf")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#173e35] px-4 text-xs font-black text-white shadow-sm disabled:opacity-45">{exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} تنزيل أ.pdf</button>
                <button type="button" disabled={!!exporting || !filteredMissed.calls.length} onClick={() => void runExport("excel")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary/25 bg-primary/8 px-4 text-xs font-black text-primary disabled:opacity-45">{exporting === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel للمتابعة</button>
              </div>
            </div>

            <div className="max-h-[460px] overflow-auto rounded-2xl border border-border/45 custom-scrollbar">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-[#2b2b2b] text-white"><tr>{["Call ID", "Internal Party", "External", "Answered", "Date", "Start Time", "Duration"].map((header) => <th key={header} className="px-3 py-3 text-left text-[11px] font-black">{header}</th>)}</tr></thead>
                <tbody>{filteredMissed.calls.map((call) => <tr key={call.id} className="border-b border-border/30 last:border-0 even:bg-secondary/20"><td className="bg-red-600 px-3 py-2 font-mono text-xs font-black text-white">Call ID: {call.id}</td><td className="px-3 py-2">{call.internalParty || "—"}</td><td className="px-3 py-2 font-mono">{call.externalParty || "—"}</td><td className="px-3 py-2 font-black text-slate-600 dark:text-slate-300">FALSE</td><td className="px-3 py-2">{call.date}</td><td className="px-3 py-2 font-mono">{call.startTime}</td><td className="px-3 py-2 font-mono">{call.duration}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground"><FileSpreadsheet className="ml-1 inline h-3.5 w-3.5" /> ملف Excel يضيف خانة «حالة المتابعة» الجاهزة للتعبئة، بينما PDF يطابق أسلوب النموذج المرفق بهوية مجموعة بودل للضيافة.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default AdminShiftStartTools;
