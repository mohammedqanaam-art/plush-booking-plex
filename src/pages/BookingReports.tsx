import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, RefreshCw, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { api, type PublicBookingReport } from "@/lib/api";

type ReportSection = "summary" | "employees";
type SortKey = "confirmed" | "total" | "rate" | "name";

const formatDate = (value: string | null) => {
  if (!value) return "غير متاح";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const BookingReports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [report, setReport] = useState<PublicBookingReport | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("confirmed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState(false);

  const section: ReportSection = searchParams.get("section") === "employees" ? "employees" : "summary";

  const loadReport = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getPublicBookingReport();
      setReport(data);
      setError("");
      return true;
    } catch {
      setError("تعذر تحميل التقرير حاليًا.");
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const startSync = async () => {
    setSyncing(true);
    setSyncError(false);
    setSyncMessage("جاري تحميل أحدث تقرير محفوظ من UNO…");
    try {
      const refreshed = await loadReport(true);
      if (!refreshed) throw new Error("refresh failed");
      setSyncMessage("تم تحميل أحدث تقرير UNO محفوظ.");
    } catch {
      setSyncError(true);
      setSyncMessage("تعذر تحميل أحدث تقرير UNO حاليًا.");
    } finally {
      setSyncing(false);
    }
  };

  const employees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ar");
    const rows = (report?.employees || []).filter((employee) => !query || employee.name.toLocaleLowerCase("ar").includes(query));
    return [...rows].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "ar");
      if (sortBy === "total") return b.total - a.total || b.confirmed - a.confirmed;
      if (sortBy === "rate") return b.confirmationRate - a.confirmationRate || b.confirmed - a.confirmed;
      return b.confirmed - a.confirmed || b.total - a.total;
    });
  }, [report, search, sortBy]);

  const setSection = (next: ReportSection) => {
    setSearchParams(next === "employees" ? { section: "employees" } : {}, { replace: true });
  };

  return (
    <div className="page-wrap">
      <PageHeader title="تقارير الحجوزات" icon={BarChart3} />

      <div className="ios-segmented" role="tablist" aria-label="أقسام التقرير">
        <button role="tab" aria-selected={section === "summary"} className={section === "summary" ? "is-active" : ""} onClick={() => setSection("summary")}>الملخص</button>
        <button role="tab" aria-selected={section === "employees"} className={section === "employees" ? "is-active" : ""} onClick={() => setSection("employees")}>نتائج الموظفين</button>
      </div>

      <section className="page-surface flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="تحديث تقرير الحجوزات">
        <h2 className="section-title">أحدث تقرير UNO</h2>
        <button
          type="button"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-4 text-sm font-bold text-primary disabled:cursor-wait disabled:opacity-60"
          onClick={() => void startSync()}
          disabled={syncing}
        >
          <RefreshCw className={`h-[18px] w-[18px] ${syncing ? "animate-spin" : ""}`} strokeWidth={1.9} />
          {syncing ? "جاري التحديث" : "تحديث العرض"}
        </button>
        {syncMessage ? <p role="status" className={`text-xs font-semibold sm:order-3 sm:w-full ${syncError ? "text-destructive" : "text-primary"}`}>{syncMessage}</p> : null}
      </section>

      {loading ? <div className="page-surface text-sm text-muted-foreground">جاري تحميل التقرير…</div> : null}
      {error ? <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

      {report && section === "summary" ? (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "إجمالي الحجوزات", value: report.summary.classifiedTotal, tone: "" },
              { label: "المؤكدة", value: report.summary.confirmed, tone: "metric-success" },
              { label: "الملغاة", value: report.summary.cancelled, tone: "metric-warning" },
              { label: "نسبة التأكيد", value: `${report.summary.confirmationRate}%`, tone: "metric-accent" },
            ].map((item) => (
              <article key={item.label} className="metric-card">
                <p>{item.label}</p>
                <strong className={item.tone}>{typeof item.value === "number" ? item.value.toLocaleString("ar-SA") : item.value}</strong>
              </article>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <article className="page-surface space-y-5">
              <h2 className="section-title">حالة الحجوزات</h2>
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm"><span>مؤكد</span><strong>{report.summary.confirmationRate}%</strong></div>
                  <div className="report-track"><span className="report-fill is-success" style={{ width: `${report.summary.confirmationRate}%` }} /></div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm"><span>ملغي</span><strong>{report.summary.cancelRate}%</strong></div>
                  <div className="report-track"><span className="report-fill is-warning" style={{ width: `${report.summary.cancelRate}%` }} /></div>
                </div>
              </div>
              <button className="ios-link-button" onClick={() => setSection("employees")}>عرض نتائج الموظفين</button>
            </article>

            <article className="page-surface space-y-3">
              <h2 className="section-title">بيانات التقرير</h2>
              <div className="info-row">
                <CalendarDays className="h-5 w-5" strokeWidth={1.7} />
                <div><p>الفترة</p><strong>{report.period.label}</strong></div>
              </div>
              <div className="info-row">
                <BarChart3 className="h-5 w-5" strokeWidth={1.7} />
                <div><p>آخر تحديث</p><strong>{formatDate(report.updatedAt)}</strong></div>
              </div>
              <p className="data-footnote">تم تصنيف {report.summary.classifiedTotal.toLocaleString("ar-SA")} من أصل {report.summary.uploadedRecords.toLocaleString("ar-SA")} سجل. غير المنسوب لموظف: {report.summary.unattributed.toLocaleString("ar-SA")} · غير المصنف: {report.summary.ignored.toLocaleString("ar-SA")}.</p>
            </article>
          </section>
        </div>
      ) : null}

      {report && section === "employees" ? (
        <section className="page-surface space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="section-title">نتائج الموظفين</h2>
            <span className="report-count">{report.summary.employeeCount.toLocaleString("ar-SA")} موظف</span>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <label className="relative block">
              <span className="sr-only">بحث باسم الموظف</span>
              <Search className="absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
              <input className="h-11 w-full rounded-xl px-10" placeholder="بحث باسم الموظف" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label>
              <span className="sr-only">ترتيب النتائج</span>
              <select className="h-11 w-full rounded-xl px-3" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
                <option value="confirmed">الأعلى تأكيدًا</option>
                <option value="total">الأعلى إجمالًا</option>
                <option value="rate">أفضل نسبة</option>
                <option value="name">الاسم</option>
              </select>
            </label>
          </div>

          <div className="employee-report-list">
            {employees.map((employee, index) => (
              <article key={employee.id} className="employee-report-row">
                <span className="employee-rank">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate">{employee.name}</h3>
                  <p>{employee.total.toLocaleString("ar-SA")} إجمالي · {employee.cancelled.toLocaleString("ar-SA")} ملغي</p>
                </div>
                <div className="employee-primary-stat">
                  <strong>{employee.confirmed.toLocaleString("ar-SA")}</strong>
                  <span>مؤكد</span>
                </div>
                <div className="employee-rate">
                  <strong>{employee.confirmationRate}%</strong>
                  <span>نسبة التأكيد</span>
                </div>
              </article>
            ))}
          </div>
          {!employees.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة.</div> : null}
        </section>
      ) : null}
    </div>
  );
};

export default BookingReports;
