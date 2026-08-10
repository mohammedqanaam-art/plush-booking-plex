import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarSearch,
  Download,
  Eye,
  EyeOff,
  FileText,
  FileSpreadsheet,
  FileWarning,
  Gauge,
  LogOut,
  MessageSquareMore,
  MoonStar,
  Radar,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Upload,
  User,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type BookingReportStats, type ContactRequest, type EmployeeAdjustment, type PublicBookingReport } from "@/lib/api";
import { isEmployeeHidden, normalizeEmployeeName, normalizeHiddenEmployees } from "@/lib/employeeVisibility";
import { clearAdminSession, getAdminSession, hasPermission, type PermissionAction, type UserRole } from "@/lib/adminAuth";
import { processBookings } from "@/lib/bookingProcessor";
import PageHeader from "@/components/PageHeader";
import AdminAnalytics from "@/components/admin/AdminAnalytics";
import ReservationReportMerge from "@/components/admin/ReservationReportMerge";

type UserRecord = { username: string; role: UserRole };
type AdminTab = "overview" | "analytics" | "bookings" | "employees" | "requests" | "users" | "settings" | "profile";
type PendingBookingReport = { file: File; stats: BookingReportStats };
type AdminTool = {
  to: string;
  label: string;
  icon: typeof Gauge;
  permission?: PermissionAction;
  roles?: UserRole[];
};

const reportRangeDays = (stats: BookingReportStats) => {
  if (!stats.dateFrom || !stats.dateTo) return 0;
  return Math.floor((new Date(`${stats.dateTo}T00:00:00Z`).getTime() - new Date(`${stats.dateFrom}T00:00:00Z`).getTime()) / 86_400_000) + 1;
};

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "مدير النظام",
  admin: "مشرف",
  editor: "محرر بيانات",
  viewer: "مشاهد داخلي",
};

const TAB_DEFINITIONS: Array<{ id: AdminTab; label: string; icon: typeof Gauge; permission: PermissionAction }> = [
  { id: "overview", label: "نظرة عامة", icon: Gauge, permission: "view" },
  { id: "analytics", label: "زيارات الموقع", icon: BarChart3, permission: "view" },
  { id: "bookings", label: "بيانات الحجوزات", icon: Upload, permission: "upload" },
  { id: "employees", label: "إدارة الموظفين", icon: UsersRound, permission: "manage_employees" },
  { id: "requests", label: "طلبات التواصل", icon: MessageSquareMore, permission: "view" },
  { id: "users", label: "المستخدمون", icon: Users, permission: "manage_users" },
  { id: "settings", label: "الإعدادات", icon: Settings, permission: "edit_settings" },
  { id: "profile", label: "الحساب", icon: User, permission: "view" },
];

const ADMIN_TOOLS: AdminTool[] = [
  { to: "/admin/uno", label: "UNO", icon: RefreshCw, roles: ["superadmin", "admin"] },
  { to: "/admin/opera-search", label: "OPERA", icon: CalendarSearch, roles: ["superadmin", "admin"] },
  { to: "/admin/avaya-reports", label: "Avaya", icon: FileSpreadsheet, permission: "upload" },
  { to: "/admin/shift-start", label: "بداية الشفت", icon: MoonStar, permission: "upload" },
  { to: "/admin/warnings", label: "إنذارات الموظفين", icon: FileWarning, permission: "manage_employees" },
  { to: "/admin/complaints", label: "إدارة الشكاوى", icon: MessageSquareMore, permission: "edit_settings" },
  { to: "/admin/discounts", label: "الخصومات", icon: Tags, permission: "edit_settings" },
  { to: "/admin/branches", label: "إدارة الفروع", icon: Building2, permission: "manage_knowledge" },
  { to: "/admin/knowledge-bank", label: "بنك المعلومات", icon: BookOpenCheck, permission: "manage_knowledge" },
  { to: "/admin/ghost", label: "سجل الزوار", icon: Radar, roles: ["superadmin", "admin"] },
  { to: "/admin/errors", label: "أخطاء النظام", icon: ShieldAlert, roles: ["superadmin", "admin"] },
  { to: "/admin/enterprise-control", label: "التحكم المؤسسي", icon: SlidersHorizontal, roles: ["superadmin", "admin"] },
  { to: "/admin/ai-maintenance", label: "مركز التطوير الذكي", icon: Sparkles, roles: ["superadmin", "admin"] },
];

const AdminDashboard = () => {
  const session = getAdminSession();
  const sessionRole = session?.role;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const can = (permission: PermissionAction) => !!session && hasPermission(session.role, permission);
  const visibleTabs = useMemo(
    () => TAB_DEFINITIONS.filter((tab) => !!sessionRole && hasPermission(sessionRole, tab.permission)),
    [sessionRole],
  );
  const visibleAdminTools = useMemo(
    () => ADMIN_TOOLS.filter((tool) => (
      !!sessionRole
      && (!tool.roles || tool.roles.includes(sessionRole))
      && (!tool.permission || hasPermission(sessionRole, tool.permission))
    )),
    [sessionRole],
  );

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [bookings, setBookings] = useState<Record<string, string | number | undefined>[]>([]);
  const [bookingStats, setBookingStats] = useState<BookingReportStats | null>(null);
  const [pendingBookingReport, setPendingBookingReport] = useState<PendingBookingReport | null>(null);
  const [bookingUploadBusy, setBookingUploadBusy] = useState(false);
  const [publicReport, setPublicReport] = useState<PublicBookingReport | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [hiddenEmployees, setHiddenEmployees] = useState<string[]>([]);
  const [employeeDisplayNames, setEmployeeDisplayNames] = useState<Record<string, string>>({});
  const [employeeAdjustments, setEmployeeAdjustments] = useState<Record<string, EmployeeAdjustment>>({});
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [reportMonth, setReportMonth] = useState("");
  const [reportYear, setReportYear] = useState("");
  const [complaintEmail, setComplaintEmail] = useState("");
  const [complaintEmailWebhook, setComplaintEmailWebhook] = useState("");
  const [complaintWhatsappNumber, setComplaintWhatsappNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const employeeStats = useMemo(() => processBookings(bookings), [bookings]);
  const shownEmployees = useMemo(
    () => employeeStats.filter((employee) => !employeeSearch.trim() || employee.agent.toLocaleLowerCase("ar").includes(employeeSearch.trim().toLocaleLowerCase("ar"))),
    [employeeStats, employeeSearch],
  );

  const loadPublicReport = async (fresh = false) => {
    try {
      setPublicReport(await api.getPublicBookingReport({ fresh }));
    } catch {
      setPublicReport(null);
    }
  };

  const loadBookings = async () => {
    try {
      const data = await api.getBookings();
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      setBookingStats(data.stats && typeof data.stats === "object" ? data.stats as BookingReportStats : null);
    } catch {
      setBookings([]);
      setBookingStats(null);
    }
  };

  useEffect(() => {
    const requested = (searchParams.get("tab") || "overview") as AdminTab;
    const allowed = visibleTabs.some((tab) => tab.id === requested) ? requested : "overview";
    setActiveTab(allowed);
    if (requested !== allowed) setSearchParams({ tab: allowed }, { replace: true });
  }, [searchParams, setSearchParams, visibleTabs]);

  useEffect(() => {
    void loadPublicReport();
    api.getSettings().then((settings) => {
      setReportMonth(settings.reportMonth || "");
      setReportYear(settings.reportYear || "");
      setHiddenEmployees(normalizeHiddenEmployees(settings.hiddenEmployees || []));
      setEmployeeDisplayNames(settings.employeeDisplayNames || {});
      setEmployeeAdjustments(settings.employeeAdjustments || {});
      setComplaintEmail(settings.complaintEmail || "");
      setComplaintEmailWebhook(settings.complaintEmailWebhook || "");
      setComplaintWhatsappNumber(settings.complaintWhatsappNumber || "");
    }).catch(() => setMessage("تعذر تحميل بعض الإعدادات."));

    if (can("manage_users")) api.getUsers().then((data) => setUsers(data.users || [])).catch(() => setUsers([]));
    if (can("manage_employees") || can("upload")) void loadBookings();
    if (can("view")) api.getContactRequests().then((data) => setRequests(data.requests || [])).catch(() => setRequests([]));
    // Session permissions do not change while this page is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab !== "requests") return;
    const load = () => api.getContactRequests().then((data) => setRequests(data.requests || [])).catch(() => setRequests([]));
    void load();
    const timer = window.setInterval(load, 12_000);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  const setTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setMessage(null);
  };

  const updateEmployeeAdjustment = (id: string, patch: Partial<EmployeeAdjustment>) => {
    setEmployeeAdjustments((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
        updatedBy: session?.username || "",
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const saveEmployeeSettings = async () => {
    try {
      await api.updateSettings({ hiddenEmployees: normalizeHiddenEmployees(hiddenEmployees), employeeDisplayNames, employeeAdjustments });
      await loadPublicReport(true);
      setMessage("تم حفظ عرض الموظفين والتعديلات.");
    } catch {
      setMessage("تعذر حفظ إعدادات الموظفين.");
    }
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setBookingUploadBusy(true);
    setPendingBookingReport(null);
    setMessage("جاري فحص بنية التقرير دون استبدال البيانات الحالية…");
    try {
      const data = await api.inspectBookingReport(file);
      setPendingBookingReport({ file, stats: data.stats });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "فشل رفع الملف.");
    } finally {
      setBookingUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmBookingReport = async () => {
    if (!pendingBookingReport) return;
    setBookingUploadBusy(true);
    setMessage("جاري اعتماد التقرير…");
    try {
      const data = await api.uploadBookingReport(pendingBookingReport.file);
      setPendingBookingReport(null);
      setMessage(`تم اعتماد ${data.stats.total.toLocaleString("ar-SA")} سجل من ${data.stats.sourceLabel}.`);
      await Promise.all([loadBookings(), loadPublicReport(true)]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر اعتماد التقرير.");
    } finally {
      setBookingUploadBusy(false);
    }
  };

  const report = publicReport?.summary;
  const pendingBookingRangeDays = pendingBookingReport ? reportRangeDays(pendingBookingReport.stats) : 0;

  return (
    <div className="page-wrap">
      <PageHeader
        title="لوحة مدير ومشرفين إدارة الحجز"
        icon={ShieldCheck}
        showBack={false}
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/18 bg-secondary/40 px-3 text-xs font-bold" onClick={async () => { await api.logout(); clearAdminSession(); navigate("/"); }}>
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">تسجيل الخروج</span>
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/15 bg-secondary/20 px-4 py-3 text-xs">
        <span className="font-bold">{session?.username} · {ROLE_LABELS[(session?.role as UserRole) || "viewer"]}</span>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar" aria-label="أقسام لوحة الإدارة">
        {visibleTabs.map((tab) => (
          <button key={tab.id} onClick={() => setTab(tab.id)} className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-xs font-bold interactive ${activeTab === tab.id ? "border-primary/50 bg-primary/15 text-primary" : "border-border/30 bg-secondary/30 text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </nav>

      {message ? <div className="rounded-xl border border-primary/20 bg-primary/8 p-3 text-sm">{message}</div> : null}

      {activeTab === "overview" ? (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              { label: "الحجوزات", value: report?.classifiedTotal || 0, icon: FileText },
              { label: "المؤكدة", value: report?.confirmed || 0, icon: ShieldCheck },
              { label: "الملغاة", value: report?.cancelled || 0, icon: BarChart3 },
              { label: "الموظفون", value: report?.employeeCount || 0, icon: UsersRound },
              { label: "طلبات التواصل", value: requests.length, icon: MessageSquareMore },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="compact-card">
                <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div>
                <p className="mt-2 kpi-value">{Number(value).toLocaleString("ar-SA")}</p>
              </div>
            ))}
          </section>

          <section className="page-surface space-y-3">
            <h2 className="section-title">الأدوات</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
              {can("upload") ? (
                <button className="admin-tool-card" onClick={() => setTab("bookings")}>
                  <span className="admin-tool-card__icon"><Upload className="h-5 w-5" /></span>
                  <strong>استيراد التقارير</strong>
                </button>
              ) : null}
              {can("manage_employees") ? (
                <button className="admin-tool-card" onClick={() => setTab("employees")}>
                  <span className="admin-tool-card__icon"><UsersRound className="h-5 w-5" /></span>
                  <strong>إدارة الموظفين</strong>
                </button>
              ) : null}
              {visibleAdminTools.map((tool) => (
                <button key={tool.to} className="admin-tool-card" onClick={() => navigate(tool.to)}>
                  <span className="admin-tool-card__icon"><tool.icon className="h-5 w-5" /></span>
                  <strong>{tool.label}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "analytics" ? <AdminAnalytics /> : null}

      {activeTab === "bookings" ? (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["السجلات المصنفة", report?.classifiedTotal || 0],
              ["المؤكدة", report?.confirmed || 0],
              ["الملغاة", report?.cancelled || 0],
              ["غير المنسوبة", report?.unattributed || 0],
              ["غير المعروفة", report?.ignored || 0],
            ].map(([label, value]) => <div key={label as string} className="compact-card"><p className="text-xs text-muted-foreground">{label as string}</p><p className="mt-2 text-2xl font-black">{Number(value).toLocaleString("ar-SA")}</p></div>)}
          </section>
          <ReservationReportMerge onApplied={async () => { await Promise.all([loadBookings(), loadPublicReport(true)]); }} />
          <section className="page-surface space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="section-title">استيراد تقرير حجوزات الموظفين</h2>
              </div>
              {bookingStats?.sourceLabel ? (
                <span className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-xs font-bold text-primary">المصدر الحالي: {bookingStats.sourceLabel}</span>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xml,.csv,application/vnd.ms-excel,application/xml,text/xml,text/csv"
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex h-11 items-center gap-2 rounded-xl gold-gradient px-4 font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
                onClick={() => fileInputRef.current?.click()}
                disabled={bookingUploadBusy}
              ><Upload className="h-4 w-4" /> {bookingUploadBusy ? "جاري الفحص" : "اختيار تقرير UNO أو CSV"}</button>
              {session?.role === "admin" || session?.role === "superadmin" ? (
                <button className="h-11 rounded-xl border border-destructive/35 px-4 text-destructive disabled:opacity-50" disabled={bookingUploadBusy} onClick={async () => {
                  if (!window.confirm("سيتم حذف جميع بيانات الحجوزات الحالية. هل تريد المتابعة؟")) return;
                  try { await api.resetBookings(); await Promise.all([loadBookings(), loadPublicReport(true)]); setMessage("تم حذف بيانات الحجوزات."); } catch { setMessage("تعذر حذف البيانات."); }
                }}>حذف جميع البيانات</button>
              ) : null}
            </div>
          </section>

          {pendingBookingReport ? (
            <section className="page-surface space-y-4 border-primary/30" aria-label="معاينة تقرير الحجوزات قبل الاعتماد">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="section-title">معاينة قبل الاعتماد</h2>
                  <p className="mt-1 break-all text-xs text-muted-foreground" dir="ltr">{pendingBookingReport.stats.sourceFileName}</p>
                </div>
                <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-bold text-emerald-700">تم التعرف: {pendingBookingReport.stats.sourceLabel}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  ["السجلات", pendingBookingReport.stats.total],
                  ["المؤكدة", pendingBookingReport.stats.confirmed],
                  ["الملغاة", pendingBookingReport.stats.cancelled],
                  ["الموظفون", pendingBookingReport.stats.employeeCount],
                  ["منسوبة لموظف", pendingBookingReport.stats.attributedRecords],
                  ["غير منسوبة", pendingBookingReport.stats.unattributedRecords],
                ].map(([label, value]) => (
                  <div key={label as string} className="compact-card">
                    <p className="text-xs text-muted-foreground">{label as string}</p>
                    <p className="mt-2 text-xl font-black">{Number(value).toLocaleString("ar-SA")}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-xl bg-secondary/40 px-3 py-2"><span className="text-muted-foreground">فترة إنشاء الحجوزات</span><strong className="mt-1 block" dir="ltr">{pendingBookingReport.stats.dateFrom && pendingBookingReport.stats.dateTo ? `${pendingBookingReport.stats.dateFrom} — ${pendingBookingReport.stats.dateTo}` : "غير متاحة"}</strong></div>
                <div className="rounded-xl bg-secondary/40 px-3 py-2"><span className="text-muted-foreground">أرقام الحجوزات الفريدة</span><strong className="mt-1 block">{pendingBookingReport.stats.uniqueReservations.toLocaleString("ar-SA")}</strong></div>
                <div className="rounded-xl bg-secondary/40 px-3 py-2"><span className="text-muted-foreground">التكرارات المستبعدة</span><strong className="mt-1 block">{pendingBookingReport.stats.duplicateReservations.toLocaleString("ar-SA")}</strong></div>
              </div>

              {pendingBookingReport.stats.unattributedRecords > 0 ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <strong>تنبيه جودة:</strong> يوجد {pendingBookingReport.stats.unattributedRecords.toLocaleString("ar-SA")} حجزًا باسم حسابات تقنية أو دون موظف. ستدخل ضمن الإجمالي، ولن تُنسب إلى موظف أو تؤثر في ترتيبه.
                  {pendingBookingReport.stats.systemAccounts.length ? <span className="mt-1 block text-xs">{pendingBookingReport.stats.systemAccounts.map((item) => `${item.name}: ${item.records.toLocaleString("ar-SA")}`).join(" · ")}</span> : null}
                </div>
              ) : null}

              {pendingBookingRangeDays > 31 ? (
                <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 p-3 text-sm text-sky-800 dark:text-sky-200">
                  <strong>تنبيه الفترة:</strong> التقرير يغطي {pendingBookingRangeDays.toLocaleString("ar-SA")} يومًا، وسيتم جمعها في نتيجة واحدة. استخدم تقريرًا شهريًا مستقلًا إذا كان الهدف قياس أداء شهر محدد.
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex h-11 items-center gap-2 rounded-xl gold-gradient px-4 font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
                  onClick={() => void confirmBookingReport()}
                  disabled={bookingUploadBusy}
                ><Save className="h-4 w-4" /> {bookingUploadBusy ? "جاري الاعتماد" : "اعتماد واستبدال البيانات الحالية"}</button>
                <button
                  className="h-11 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50"
                  onClick={() => setPendingBookingReport(null)}
                  disabled={bookingUploadBusy}
                >إلغاء</button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "employees" ? (
        <section className="page-surface space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">إدارة عرض الموظفين</h2>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl gold-gradient px-4 text-sm font-bold text-primary-foreground" onClick={() => void saveEmployeeSettings()}><Save className="h-4 w-4" /> حفظ التغييرات</button>
          </div>
          <label className="relative block">
            <span className="sr-only">بحث باسم الموظف</span>
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="h-11 w-full rounded-xl border bg-secondary/65 px-10" placeholder="بحث باسم الموظف" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} />
          </label>
          <div className="grid max-h-[640px] gap-3 overflow-auto pr-0.5 custom-scrollbar lg:grid-cols-2">
            {shownEmployees.map((employee) => {
              const id = normalizeEmployeeName(employee.agent);
              const hidden = isEmployeeHidden(employee.agent, hiddenEmployees);
              const adjustment = employeeAdjustments[id] || {};
              const confirmedAdjustment = Number(adjustment.confirmedAdjustment || 0);
              const cancelledAdjustment = Number(adjustment.cancelledAdjustment || 0);
              return (
                <article key={id} className="compact-card space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0"><p className="truncate font-bold">{employeeDisplayNames[id] || employee.agent}</p><p className="text-xs text-muted-foreground">الأصل: {employee.agent}</p></div>
                    <button className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs ${hidden ? "border-amber-400/30 text-amber-300" : "border-emerald-400/30 text-emerald-300"}`} onClick={() => setHiddenEmployees((current) => hidden ? current.filter((name) => !isEmployeeHidden(name, [employee.agent])) : normalizeHiddenEmployees([...current, employee.agent]))}>
                      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {hidden ? "مخفي" : "ظاهر"}
                    </button>
                  </div>
                  <label className="block text-xs"><span className="mb-1 block text-muted-foreground">اسم العرض</span><input className="h-10 w-full rounded-xl border bg-secondary/65 px-3" value={employeeDisplayNames[id] ?? employee.agent} onChange={(event) => setEmployeeDisplayNames((current) => ({ ...current, [id]: event.target.value }))} /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs"><span className="mb-1 block text-muted-foreground">تعديل المؤكد</span><input type="number" className="h-10 w-full rounded-xl border bg-secondary/65 px-3" value={confirmedAdjustment} onChange={(event) => updateEmployeeAdjustment(id, { confirmedAdjustment: Number(event.target.value) })} /></label>
                    <label className="text-xs"><span className="mb-1 block text-muted-foreground">تعديل الملغي</span><input type="number" className="h-10 w-full rounded-xl border bg-secondary/65 px-3" value={cancelledAdjustment} onChange={(event) => updateEmployeeAdjustment(id, { cancelledAdjustment: Number(event.target.value) })} /></label>
                  </div>
                  <label className="block text-xs"><span className="mb-1 block text-muted-foreground">سبب التعديل</span><input className="h-10 w-full rounded-xl border bg-secondary/65 px-3" value={adjustment.adjustmentReason || ""} onChange={(event) => updateEmployeeAdjustment(id, { adjustmentReason: event.target.value })} placeholder="اختياري" /></label>
                  <div className="flex items-center justify-between rounded-xl bg-secondary/30 px-3 py-2 text-xs"><span>بعد التعديل</span><strong>{Math.max(0, employee.confirmed + confirmedAdjustment)} مؤكد · {Math.max(0, employee.cancelled + cancelledAdjustment)} ملغي</strong></div>
                </article>
              );
            })}
          </div>
          {!shownEmployees.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد بيانات موظفين.</div> : null}
        </section>
      ) : null}

      {activeTab === "requests" ? (
        <section className="page-surface grid gap-3 md:grid-cols-2">
          {requests.map((request) => (
            <article key={request.id} className="compact-card flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-bold">{request.requestNo} · {request.guestName}</p><p className="truncate text-xs text-muted-foreground">{request.brand} · {request.branchName} · {request.guestPhone}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{request.reason}</p></div>
              <button className="h-9 shrink-0 rounded-xl border border-primary/15 px-3 text-xs" onClick={async () => { await api.updateContactRequestStatus(request.id, request.status === "new" ? "done" : "new"); setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: item.status === "new" ? "done" : "new" } : item)); }}>{request.status === "new" ? "إكمال" : "إعادة فتح"}</button>
            </article>
          ))}
          {!requests.length ? <p className="text-sm text-muted-foreground">لا توجد طلبات حاليًا.</p> : null}
        </section>
      ) : null}

      {activeTab === "users" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <form className="page-surface space-y-3" onSubmit={async (event) => { event.preventDefault(); try { await api.createUser(username, password, role); const data = await api.getUsers(); setUsers(data.users || []); setUsername(""); setPassword(""); setMessage("تمت إضافة المستخدم."); } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إضافة المستخدم."); } }}>
            <h2 className="section-title"><UserPlus className="ml-1 inline h-4 w-4" /> إضافة مستخدم</h2>
            <label className="block text-xs"><span className="mb-1 block text-muted-foreground">اسم المستخدم</span><input required className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label className="block text-xs"><span className="mb-1 block text-muted-foreground">كلمة المرور</span><input required className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} /><small className="mt-1 block text-muted-foreground">12 حرفًا على الأقل.</small></label>
            <label className="block text-xs"><span className="mb-1 block text-muted-foreground">الدور</span><select className="h-11 w-full rounded-xl border bg-secondary/65 px-3" value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="viewer">مشاهد داخلي</option><option value="editor">محرر بيانات</option><option value="admin">مشرف</option><option value="superadmin">مدير النظام</option></select></label>
            <button className="h-11 rounded-xl gold-gradient px-4 font-bold text-primary-foreground">حفظ المستخدم</button>
          </form>
          <section className="page-surface space-y-2">
            <h2 className="section-title">الحسابات الحالية</h2>
            {users.map((user) => <div className="flex items-center justify-between gap-2 border-b border-border/20 py-2 last:border-0" key={user.username}><div><p className="font-bold">{user.username}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p></div><button disabled={user.username === session?.username} className="text-xs text-destructive disabled:cursor-not-allowed disabled:opacity-30" onClick={async () => { await api.deleteUser(user.username); setUsers((current) => current.filter((item) => item.username !== user.username)); }}>حذف</button></div>)}
          </section>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <section className="page-surface space-y-4">
          <h2 className="section-title">إعدادات التقارير</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs"><span className="mb-1 block text-muted-foreground">شهر التقرير</span><input className="h-11 w-full rounded-xl border bg-secondary/65 px-3" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} /></label>
            <label className="text-xs"><span className="mb-1 block text-muted-foreground">سنة التقرير</span><input className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" value={reportYear} onChange={(event) => setReportYear(event.target.value)} /></label>
            <label className="text-xs"><span className="mb-1 block text-muted-foreground">بريد تنبيهات الشكاوى</span><input className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" value={complaintEmail} onChange={(event) => setComplaintEmail(event.target.value)} /></label>
            <label className="text-xs"><span className="mb-1 block text-muted-foreground">رقم واتساب</span><input className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" value={complaintWhatsappNumber} onChange={(event) => setComplaintWhatsappNumber(event.target.value)} /></label>
            <label className="text-xs md:col-span-2"><span className="mb-1 block text-muted-foreground">رابط تنبيهات الشكاوى</span><input className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" value={complaintEmailWebhook} onChange={(event) => setComplaintEmailWebhook(event.target.value)} /></label>
          </div>
          <button className="inline-flex h-11 items-center gap-2 rounded-xl gold-gradient px-4 font-bold text-primary-foreground" onClick={async () => { try { await api.updateSettings({ reportMonth, reportYear, complaintEmail, complaintEmailWebhook, complaintWhatsappNumber }); await loadPublicReport(true); setMessage("تم حفظ الإعدادات."); } catch { setMessage("تعذر حفظ الإعدادات."); } }}><Download className="h-4 w-4" /> حفظ الإعدادات</button>
        </section>
      ) : null}

      {activeTab === "profile" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="page-surface space-y-3"><h2 className="section-title">معلومات الحساب</h2><div className="compact-card"><p className="text-xs text-muted-foreground">اسم المستخدم</p><p className="mt-1 font-bold">{session?.username}</p></div><div className="compact-card"><p className="text-xs text-muted-foreground">الدور</p><p className="mt-1 font-bold">{ROLE_LABELS[(session?.role as UserRole) || "viewer"]}</p></div></section>
          <form className="page-surface space-y-3" onSubmit={async (event) => { event.preventDefault(); if (newPassword !== confirmPassword) { setMessage("كلمتا المرور غير متطابقتين."); return; } if (newPassword.length < 12) { setMessage("كلمة المرور الجديدة يجب أن تكون 12 حرفًا على الأقل."); return; } try { await api.changePassword(currentPassword, newPassword); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("تم تغيير كلمة المرور."); } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تغيير كلمة المرور."); } }}>
            <h2 className="section-title">تغيير كلمة المرور</h2>
            <input required className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" type="password" placeholder="كلمة المرور الحالية" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            <input required className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" type="password" minLength={12} placeholder="كلمة المرور الجديدة" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <input required className="h-11 w-full rounded-xl border bg-secondary/65 px-3" dir="ltr" type="password" placeholder="تأكيد كلمة المرور" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            <button className="h-11 rounded-xl gold-gradient px-4 font-bold text-primary-foreground">حفظ كلمة المرور</button>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default AdminDashboard;
