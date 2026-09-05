import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, Award, BadgeDollarSign, Bot, BriefcaseBusiness, Cable, CalendarDays,
  CheckCircle2, ExternalLink, Headphones, HeartHandshake, LayoutDashboard, ListTodo, Network,
  PhoneCall, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Trash2, TrendingUp, UsersRound,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLocation } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { getAdminSession } from "@/lib/adminAuth";
import type { CallCenterOperationsResponse } from "@/lib/callCenterOperations";
import type { CallCenterForecastScopeOption } from "@/lib/callCenterForecastScope";
import { CALL_CENTER_INDUSTRY_PROFILES, callCenterProfileById } from "@/lib/callCenterProfiles";
import { EMPLOYEE_AGENT_CATALOG, type EmployeeAgentId } from "@/lib/employeeAgents";
import { employeeHub, type BookingMatch, type EmployeeBackupManifest } from "@/lib/employeeHub";
import type {
  CallCenterIndustry, CallCenterProject, CallCenterRoutingKind, EmployeeQualityNote, EmployeeShift, EmployeeTask,
  EmployeeWorkspaceSnapshot,
} from "@/lib/employeeWorkspaceTypes";

type Tab = "overview" | "agents" | "tasks" | "schedule" | "call-center" | "calls" | "quality" | "marketing";

const emptyWorkspace: EmployeeWorkspaceSnapshot = {
  tasks: [], shifts: [], qualityNotes: [], callReviews: [], marketingEngagements: [], callCenterProjects: [], generatedAt: "",
};

const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
  { id: "agents", label: "الوكلاء", icon: Bot },
  { id: "tasks", label: "لوحة العمل", icon: ListTodo },
  { id: "schedule", label: "الشفتات", icon: CalendarDays },
  { id: "call-center", label: "تشغيل الكول سنتر", icon: PhoneCall },
  { id: "calls", label: "المكالمات", icon: Headphones },
  { id: "quality", label: "الجودة", icon: Award },
  { id: "marketing", label: "الاستشارات التسويقية", icon: BriefcaseBusiness },
];

const icons: Record<(typeof EMPLOYEE_AGENT_CATALOG)[number]["icon"], LucideIcon> = {
  search: Search, headphones: Headphones, heart: HeartHandshake, award: Award,
  calendar: CalendarDays, tasks: ListTodo, sparkles: Sparkles,
};

const fieldClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const textAreaClass = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";
const primaryButton = "inline-flex h-11 items-center justify-center gap-2 rounded-xl gold-gradient px-4 text-sm font-bold text-primary-foreground disabled:opacity-50";
const todayRiyadh = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

const approvalLabels = {
  "automatic-read": "قراءة تلقائية",
  employee: "بقرار الموظف",
  supervisor: "اعتماد مشرف",
  "company-only": "تكامل الشركة فقط",
} as const;

const projectStatusLabels: Record<CallCenterProject["status"], string> = {
  design: "تصميم", pilot: "تجريبي", active: "نشط", paused: "موقوف",
};

const overallForecastScope: CallCenterForecastScopeOption = {
  key: "overall", kind: "overall", label: "الإجمالي — التقرير غير المقسّم",
};

const errorText = (error: unknown) => {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    "Read-only account": "حسابك للعرض فقط؛ اطلب من المشرف صلاحية محرر.",
    "Delete requires admin": "الحذف متاح للمشرف أو المدير فقط.",
    "OpenAI is not configured": "مفتاح OpenAI غير مهيأ في بيئة التشغيل.",
    "File must be between 1 byte and 4 MB": "حجم الملف يجب ألا يتجاوز 4 ميجابايت.",
    "Agent quota exceeded": "وصلت إلى حد تشغيل الوكلاء المؤقت؛ حاول لاحقًا أو تواصل مع المشرف.",
    "Call review quota exceeded": "وصلت إلى حد مراجعات المكالمات المؤقت؛ حاول لاحقًا.",
    CONTRACT_REQUIRED_FOR_EXECUTION: "لا يبدأ التنفيذ قبل اعتماد الاتفاق أو تفعيل العقد.",
    "Admin required": "إدارة مشاريع الكول سنتر متاحة للمشرف والمدير فقط.",
  };
  return messages[code] || code || "تعذر إكمال العملية. حاول مرة أخرى.";
};

const EmployeeAssistant = () => {
  const location = useLocation();
  const session = getAdminSession();
  const canEdit = Boolean(session && session.role !== "viewer");
  const canDelete = Boolean(session && ["admin", "superadmin"].includes(session.role));
  const canManageQuality = canDelete;
  const canManageCallCenter = canDelete;
  const [tab, setTab] = useState<Tab>(location.pathname === "/admin/call-center" ? "call-center" : "overview");
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [backups, setBackups] = useState<EmployeeBackupManifest[]>([]);
  const [callCenter, setCallCenter] = useState<CallCenterOperationsResponse | null>(null);
  const [forecastScope, setForecastScope] = useState<CallCenterForecastScopeOption>(overallForecastScope);
  const [callCenterError, setCallCenterError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<EmployeeAgentId>("shift_director");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentReply, setAgentReply] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [selectedMarketingId, setSelectedMarketingId] = useState("");
  const [bookingMatches, setBookingMatches] = useState<BookingMatch[]>([]);
  const [taskDraft, setTaskDraft] = useState({ title: "", description: "", assignee: session?.username || "", priority: "medium", dueAt: "", projectId: "" });
  const [shiftDraft, setShiftDraft] = useState({ employeeName: session?.username || "", date: todayRiyadh, startTime: "08:00", endTime: "16:00", role: "حجوزات", notes: "", projectId: "" });
  const [qualityDraft, setQualityDraft] = useState({ employeeName: session?.username || "", category: "ملاحظة عامة", score: "", note: "" });
  const [callFile, setCallFile] = useState<File | null>(null);
  const [callInputKey, setCallInputKey] = useState(0);
  const [callEmployee, setCallEmployee] = useState(session?.username || "");
  const [supervisorNotes, setSupervisorNotes] = useState("");
  const [callAuthorized, setCallAuthorized] = useState(false);
  const [marketingDraft, setMarketingDraft] = useState({
    clientName: "", projectName: "", serviceType: "استشارة وخطة تسويقية",
    contractReference: "", contractStatus: "draft", value: "", currency: "SAR",
    objective: "", deliverables: "", plan: "",
  });
  const [selectedIndustry, setSelectedIndustry] = useState<CallCenterIndustry>("general");
  const [toolProjectId, setToolProjectId] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [routingDrafts, setRoutingDrafts] = useState<Record<string, { routingKind: CallCenterRoutingKind; identifiers: string }>>({});
  const [projectDraft, setProjectDraft] = useState({
    name: "", clientName: "", industry: "general" as CallCenterIndustry,
    operatingHours: "08:00 - 00:00", serviceLevelSeconds: "20", targetAnswerRate: "80", notes: "",
    assignedEmployees: "", enabledToolIds: CALL_CENTER_INDUSTRY_PROFILES[0].tools.map((tool) => tool.id),
    routingKind: "queue" as CallCenterRoutingKind, routingIdentifiers: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [workspaceResult, operationsResult, backupsResult] = await Promise.allSettled([
        employeeHub.workspace(),
        canManageCallCenter ? employeeHub.callCenterOperations(forecastScope) : Promise.resolve(null),
        session?.role === "superadmin" ? employeeHub.backups() : Promise.resolve({ backups: [] }),
      ]);
      if (workspaceResult.status === "rejected") throw workspaceResult.reason;
      setWorkspace(workspaceResult.value);
      if (operationsResult.status === "fulfilled" && operationsResult.value) {
        setCallCenter(operationsResult.value);
        setCallCenterError("");
      } else if (canManageCallCenter) {
        setCallCenterError("تعذر تحميل توقعات Avaya الآن؛ بقية مساحة العمل ما زالت متاحة.");
      } else {
        setCallCenter(null);
        setCallCenterError("");
      }
      if (backupsResult.status === "fulfilled") setBackups(backupsResult.value.backups);
      setNotice(null);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [canManageCallCenter, forecastScope, session?.role]);

  useEffect(() => { void refresh(); }, [refresh]);

  const metrics = useMemo(() => ({
    openTasks: workspace.tasks.filter((task) => task.status !== "done").length,
    todayShifts: workspace.shifts.filter((shift) => shift.date === todayRiyadh).length,
    reviews: workspace.callReviews.length,
    qualityNotes: workspace.qualityNotes.length,
    contractedValue: workspace.marketingEngagements
      .filter((engagement) => engagement.currency === "SAR" && ["agreed", "active", "completed"].includes(engagement.contractStatus))
      .reduce((sum, engagement) => sum + (engagement.value || 0), 0),
    activeProjects: workspace.callCenterProjects.filter((project) => project.status === "active").length,
  }), [workspace]);

  const selectedToolProject = workspace.callCenterProjects.find((project) => project.id === toolProjectId);
  const selectedProfile = callCenterProfileById(selectedToolProject?.industry || selectedIndustry);
  const visibleTools = selectedToolProject
    ? selectedProfile.tools.filter((tool) => (selectedToolProject.enabledToolIds
      ?? selectedProfile.tools.map((candidate) => candidate.id)).includes(tool.id))
    : selectedProfile.tools;
  const displayedTools = selectedToolProject && canManageCallCenter ? selectedProfile.tools : visibleTools;
  const projectName = (projectId?: string | null) => (
    workspace.callCenterProjects.find((project) => project.id === projectId)?.name || "بدون مشروع"
  );
  const forecastChart = useMemo(() => {
    const forecast = callCenter?.forecast;
    if (!forecast) return [];
    return [
      ...forecast.observed.slice(-14).map((day) => ({ date: day.date.slice(5), actual: day.offered })),
      ...forecast.forecast.map((day) => ({
        date: day.date.slice(5), predicted: day.predictedOffered, lower: day.lowerOffered, upper: day.upperOffered,
      })),
    ];
  }, [callCenter]);

  const mutate = async (work: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      await refresh();
      setNotice(success);
      return true;
    } catch (error) {
      setNotice(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const runAgent = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setAgentReply("");
    setBookingMatches([]);
    setNotice(null);
    try {
      const result = await employeeHub.runAgent(selectedAgent, prompt.trim(), selectedProjectId || undefined);
      setAgentReply(result.reply);
      setAgentModel(result.model);
      setBookingMatches(result.bookingMatches || []);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const reviewCall = async () => {
    if (!callFile) return;
    setBusy(true);
    setNotice(null);
    try {
      await employeeHub.reviewCall(callFile, callEmployee, supervisorNotes);
      setCallFile(null);
      setCallInputKey((value) => value + 1);
      setSupervisorNotes("");
      setCallAuthorized(false);
      await refresh();
      setNotice("اكتملت مراجعة المكالمة بواسطة المستمعَين وحُفظت النتيجة دون حفظ الملف الصوتي.");
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const approveAgentResultAsTask = async () => {
    const agentName = EMPLOYEE_AGENT_CATALOG.find((agent) => agent.id === selectedAgent)?.name || "الوكيل";
    const firstLine = agentReply.split(/\r?\n/).find((line) => line.trim())?.replace(/^[-#*\d.\s]+/, "").trim() || `نتيجة ${agentName}`;
    await mutate(() => employeeHub.create<EmployeeTask>("tasks", {
      title: firstLine.slice(0, 180),
      description: agentReply.slice(0, 1_500),
      assignee: session?.username || "",
      priority: "medium",
      source: `approved-agent:${selectedAgent}`,
      projectId: selectedProjectId || null,
    }), "اعتمدت نتيجة الوكيل وأضيفت كمهمة قابلة للتتبع.");
  };

  const saveAgentPlanToMarketing = async () => {
    if (!selectedMarketingId) return;
    await mutate(
      () => employeeHub.update("marketingEngagements", selectedMarketingId, { plan: agentReply }),
      "اعتمدت الخطة وحُفظت في ملف الاستشارة.",
    );
  };

  return (
    <div className="page-wrap-wide space-y-4">
      <PageHeader title="مركز الموظفين والوكلاء" icon={UsersRound} />

      <section className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-emerald-950 to-emerald-800 px-4 py-5 text-white md:px-6">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5" />مساحة عمل واحدة بدل ملفات Excel المتفرقة</div>
            <p className="mt-1 text-xs text-white/70">7 وكلاء · مشاريع متعددة · Avaya · توقعات · جودة · مهام · شفتات · اعتماد بشري</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">{session?.username} · {session?.role}</span>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10" aria-label="تحديث"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </div>

        <div className="border-b border-border bg-background/60 px-2 py-2">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}><item.icon className="h-4 w-4" />{item.label}</button>)}
          </div>
        </div>

        {notice ? <div className="mx-4 mt-4 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm" role="status">{notice}</div> : null}

        <div className="p-4 md:p-6">
          {tab === "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {[
                  ["مهام مفتوحة", metrics.openTasks, ListTodo],
                  ["شفتات اليوم", metrics.todayShifts, CalendarDays],
                  ["مراجعات المكالمات", metrics.reviews, Headphones],
                  ["ملاحظات الجودة", metrics.qualityNotes, Award],
                  ["دخل استشاري متعاقد", `${metrics.contractedValue.toLocaleString("ar-SA")} ر.س`, BadgeDollarSign],
                  ["مشاريع كول سنتر نشطة", metrics.activeProjects, PhoneCall],
                ].map(([label, value, Icon]) => <div key={String(label)} className="rounded-2xl border border-border bg-background p-4"><Icon className="mb-3 h-5 w-5 text-primary" /><strong className="block text-2xl">{String(value)}</strong><span className="text-xs text-muted-foreground">{String(label)}</span></div>)}
              </div>
              <div>
                <h2 className="mb-3 text-sm font-bold">فريق الوكلاء السبعة</h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {EMPLOYEE_AGENT_CATALOG.map((agent) => {
                    const Icon = icons[agent.icon];
                    return <button key={agent.id} type="button" onClick={() => { setSelectedAgent(agent.id); setTab("agents"); }} className="rounded-2xl border border-border bg-background p-4 text-start transition hover:border-primary/50 hover:shadow-sm"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><span><strong className="block text-sm">{agent.name}</strong><small className="text-[10px] text-primary">{agent.badge}</small><span className="mt-1 block text-xs leading-6 text-muted-foreground">{agent.description}</span></span></div></button>;
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "agents" ? (
            <div className="grid gap-5 lg:grid-cols-[310px_1fr]">
              <div className="space-y-2">
                {EMPLOYEE_AGENT_CATALOG.map((agent) => {
                  const Icon = icons[agent.icon];
                    return <button key={agent.id} type="button" onClick={() => { setSelectedAgent(agent.id); setAgentReply(""); setBookingMatches([]); setSelectedMarketingId(""); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-start ${selectedAgent === agent.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}><Icon className="h-5 w-5 shrink-0 text-primary" /><span><strong className="block text-sm">{agent.name}</strong><small className="text-muted-foreground">{agent.badge}</small></span></button>;
                })}
              </div>
              <div className="rounded-2xl border border-border bg-background p-4 md:p-5">
                <div className="mb-4 flex items-start gap-3"><Bot className="mt-1 h-5 w-5 text-primary" /><div><h2 className="font-bold">{EMPLOYEE_AGENT_CATALOG.find((agent) => agent.id === selectedAgent)?.name}</h2><p className="text-xs leading-6 text-muted-foreground">يستخدم بيانات مساحة العمل الحالية. أي تعديل تشغيلي سيبقى اقتراحًا حتى تعتمده من الواجهة.</p></div></div>
                <label className="mb-3 block text-xs text-muted-foreground"><span className="mb-1 block">سياق المشروع الاختياري</span><select className={fieldClass} value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}><option value="">بدون إرفاق مشروع</option>{workspace.callCenterProjects.map((project) => <option key={project.id} value={project.id}>{project.name} · {callCenterProfileById(project.industry).name}</option>)}</select></label>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value.slice(0, 8_000))} rows={7} className={textAreaClass} placeholder={selectedAgent === "reservation_matcher" ? "اكتب رقم UNO أو PMS كاملًا، 7 أرقام على الأقل من الهاتف، أو اسم الضيف الكامل مع التاريخ…" : "اكتب المطلوب والقيود والنتيجة التي تريدها…"} dir="auto" />
                <button type="button" onClick={() => void runAgent()} disabled={!canEdit || busy || !prompt.trim()} className={`${primaryButton} mt-3`}><Send className="h-4 w-4" />{busy ? "جاري التشغيل…" : "تشغيل الوكيل"}</button>
                {agentReply ? <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>النتيجة</span><span>{agentModel}</span></div><div className="whitespace-pre-wrap text-sm leading-7" dir="auto">{agentReply}</div>{canEdit ? <div className="mt-4 flex flex-wrap gap-2 border-t border-primary/15 pt-3"><button type="button" disabled={busy} onClick={() => void approveAgentResultAsTask()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/30 px-3 text-xs font-bold text-primary"><CheckCircle2 className="h-4 w-4" />اعتماد النتيجة كمهمة</button>{selectedAgent === "shift_scheduler" ? <button type="button" onClick={() => { setShiftDraft((value) => ({ ...value, notes: agentReply.slice(0, 1_000), projectId: selectedProjectId })); setTab("schedule"); setNotice("نُقلت النتيجة إلى مسودة الشفت؛ راجع الأوقات ثم احفظها."); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/30 px-3 text-xs font-bold text-primary"><CalendarDays className="h-4 w-4" />تحويل لمسودة شفت</button> : null}{selectedMarketingId && selectedAgent === "task_board" ? <button type="button" disabled={busy} onClick={() => void saveAgentPlanToMarketing()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/30 px-3 text-xs font-bold text-primary"><BriefcaseBusiness className="h-4 w-4" />اعتماد وحفظ الخطة</button> : null}</div> : null}</div> : null}
                {bookingMatches.length ? <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"><div className="mb-3"><h3 className="text-sm font-bold">نتائج المطابقة المحلية المصرّح بها</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">لم تُرسل أسماء الضيوف أو أرقام UNO/PMS أو آخر أرقام الهاتف إلى نموذج الذكاء الاصطناعي.</p></div><div className="space-y-2">{bookingMatches.map((match, index) => <article key={`${match.unoNumber}-${match.pmsNumber}-${index}`} className="rounded-xl border border-border bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{match.guestName || `مرشح ${index + 1}`}</strong><span className="rounded-full bg-secondary px-2 py-1 text-[10px]">ثقة المطابقة {match.score}</span></div><div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2"><span dir="ltr">UNO: {match.unoNumber || "—"}</span><span dir="ltr">PMS: {match.pmsNumber || "—"}</span><span>الجوال: •••• {match.phoneLast4 || "—"}</span><span>{match.property || match.city || "—"}</span><span>الدخول: {match.checkIn || "—"}</span><span>الخروج: {match.checkOut || "—"}</span></div></article>)}</div></div> : null}
              </div>
            </div>
          ) : null}

          {tab === "tasks" ? (
            <div className="space-y-5">
              {canEdit ? <form onSubmit={(event) => { event.preventDefault(); void mutate(() => employeeHub.create<EmployeeTask>("tasks", taskDraft), "أضيفت المهمة إلى اللوحة المشتركة.").then((saved) => { if (saved) setTaskDraft((value) => ({ ...value, title: "", description: "", dueAt: "" })); }); }} className="grid gap-3 rounded-2xl border border-border bg-secondary/20 p-4 md:grid-cols-6"><input required className={`${fieldClass} md:col-span-2`} placeholder="عنوان المهمة" value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} /><input className={fieldClass} placeholder="المسؤول" value={taskDraft.assignee} onChange={(event) => setTaskDraft({ ...taskDraft, assignee: event.target.value })} /><select className={fieldClass} value={taskDraft.priority} onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value })}><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select><input type="datetime-local" className={fieldClass} aria-label="موعد المهمة" value={taskDraft.dueAt} onChange={(event) => setTaskDraft({ ...taskDraft, dueAt: event.target.value })} /><select className={fieldClass} aria-label="مشروع المهمة" value={taskDraft.projectId} onChange={(event) => setTaskDraft({ ...taskDraft, projectId: event.target.value })}><option value="">بدون مشروع</option>{workspace.callCenterProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><textarea rows={2} className={`${textAreaClass} md:col-span-5`} placeholder="تفاصيل المهمة أو نتيجة الوكيل المعتمدة" value={taskDraft.description} onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value.slice(0, 1_500) })} /><button disabled={busy} className={primaryButton}><Plus className="h-4 w-4" />إضافة</button></form> : null}
              <div className="grid gap-4 lg:grid-cols-3">
                {(["todo", "doing", "done"] as const).map((status) => <section key={status} className="rounded-2xl border border-border bg-secondary/15 p-3"><h3 className="mb-3 flex items-center justify-between text-sm font-bold"><span>{status === "todo" ? "جديدة" : status === "doing" ? "قيد التنفيذ" : "مكتملة"}</span><span className="rounded-full bg-background px-2 py-0.5 text-xs">{workspace.tasks.filter((task) => task.status === status).length}</span></h3><div className="space-y-2">{workspace.tasks.filter((task) => task.status === status).map((task) => <article key={task.id} className="rounded-xl border border-border bg-background p-3"><div className="flex items-start justify-between gap-2"><strong className="text-sm leading-6">{task.title}</strong>{canDelete ? <button type="button" onClick={() => void mutate(() => employeeHub.remove("tasks", task.id), "حُذفت المهمة.")} className="text-muted-foreground hover:text-destructive" aria-label="حذف"><Trash2 className="h-4 w-4" /></button> : null}</div>{task.description ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{task.description}</p> : null}<div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{task.assignee}</span><span>·</span><span>{task.priority}</span><span>·</span><span>{projectName(task.projectId)}</span></div>{canEdit ? <select value={task.status} onChange={(event) => void mutate(() => employeeHub.update<EmployeeTask>("tasks", task.id, { status: event.target.value }), "تحدثت حالة المهمة.")} className="mt-3 h-9 w-full rounded-lg border border-border bg-secondary px-2 text-xs"><option value="todo">جديدة</option><option value="doing">قيد التنفيذ</option><option value="done">مكتملة</option></select> : null}</article>)}</div></section>)}
              </div>
            </div>
          ) : null}

          {tab === "schedule" ? (
            <div className="space-y-5">
              {canEdit ? <form onSubmit={(event) => { event.preventDefault(); void mutate(() => employeeHub.create<EmployeeShift>("shifts", shiftDraft), "أضيف الشفت إلى الجدول.").then((saved) => { if (saved) setShiftDraft((value) => ({ ...value, notes: "" })); }); }} className="grid gap-3 rounded-2xl border border-border bg-secondary/20 p-4 md:grid-cols-3 lg:grid-cols-6"><input required className={fieldClass} placeholder="الموظف" value={shiftDraft.employeeName} onChange={(event) => setShiftDraft({ ...shiftDraft, employeeName: event.target.value })} /><input required type="date" className={fieldClass} value={shiftDraft.date} onChange={(event) => setShiftDraft({ ...shiftDraft, date: event.target.value })} /><input required type="time" className={fieldClass} value={shiftDraft.startTime} onChange={(event) => setShiftDraft({ ...shiftDraft, startTime: event.target.value })} /><input required type="time" className={fieldClass} value={shiftDraft.endTime} onChange={(event) => setShiftDraft({ ...shiftDraft, endTime: event.target.value })} /><input className={fieldClass} placeholder="الدور" value={shiftDraft.role} onChange={(event) => setShiftDraft({ ...shiftDraft, role: event.target.value })} /><select className={fieldClass} aria-label="مشروع الشفت" value={shiftDraft.projectId} onChange={(event) => setShiftDraft({ ...shiftDraft, projectId: event.target.value })}><option value="">بدون مشروع</option>{workspace.callCenterProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><textarea rows={2} className={`${textAreaClass} md:col-span-2 lg:col-span-5`} placeholder="ملاحظات التغطية أو اقتراح الوكيل المعتمد" value={shiftDraft.notes} onChange={(event) => setShiftDraft({ ...shiftDraft, notes: event.target.value.slice(0, 1_000) })} /><button disabled={busy} className={primaryButton}><Plus className="h-4 w-4" />إضافة</button></form> : null}
              <div className="overflow-x-auto rounded-2xl border border-border"><table className="w-full min-w-[860px] text-sm"><thead className="bg-secondary/60 text-xs text-muted-foreground"><tr><th className="p-3 text-start">التاريخ</th><th className="p-3 text-start">الموظف</th><th className="p-3 text-start">الوقت</th><th className="p-3 text-start">المشروع</th><th className="p-3 text-start">الدور</th><th className="p-3 text-start">الحالة</th><th className="p-3" /></tr></thead><tbody>{workspace.shifts.map((shift) => <tr key={shift.id} className="border-t border-border"><td className="p-3">{shift.date}</td><td className="p-3 font-semibold">{shift.employeeName}</td><td className="p-3" dir="ltr">{shift.startTime} – {shift.endTime}</td><td className="p-3 text-xs">{projectName(shift.projectId)}</td><td className="p-3">{shift.role}</td><td className="p-3">{canEdit ? <select value={shift.status} onChange={(event) => void mutate(() => employeeHub.update<EmployeeShift>("shifts", shift.id, { status: event.target.value }), "تحدثت حالة الشفت.")} className="h-9 rounded-lg border border-border bg-secondary px-2 text-xs"><option value="planned">مخطط</option><option value="confirmed">مؤكد</option><option value="completed">مكتمل</option></select> : shift.status}</td><td className="p-3 text-end">{canDelete ? <button type="button" onClick={() => void mutate(() => employeeHub.remove("shifts", shift.id), "حُذف الشفت.")} className="text-muted-foreground hover:text-destructive" aria-label="حذف"><Trash2 className="h-4 w-4" /></button> : null}</td></tr>)}</tbody></table></div>
            </div>
          ) : null}

          {tab === "call-center" ? (
            <div className="space-y-6">
              <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-2xl border border-border bg-background p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 font-bold"><Activity className="h-5 w-5 text-primary" />توقع حركة المكالمات</h2>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">توقع تشغيلي من تقارير Avaya اليومية المحفوظة، مع نطاق عدم يقين وأسباب محتملة قابلة للمراجعة.</p>
                    </div>
                    {callCenter ? <div className="flex flex-col items-end gap-2"><select className="h-9 max-w-72 rounded-lg border border-border bg-secondary px-2 text-xs" aria-label="نطاق توقع المكالمات" value={forecastScope.key} onChange={(event) => { const selected = (callCenter.forecastScope?.options || [overallForecastScope]).find((option) => option.key === event.target.value); if (selected) setForecastScope(selected); }}>{(callCenter.forecastScope?.options || [overallForecastScope]).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${callCenter.forecast.status === "ready" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{callCenter.forecast.status === "ready" ? `الثقة: ${callCenter.forecast.confidence}` : `يلزم ${callCenter.forecast.requiredDays} أيام يومية`}</span></div> : null}
                  </div>

                  {callCenterError ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{callCenterError}</div> : null}
                  {callCenter?.forecastScope ? <div className={`mt-4 rounded-xl border p-3 text-xs leading-6 ${["project-unmapped", "selection-required", "no-matched-data"].includes(callCenter.forecastScope.status) ? "border-amber-500/25 bg-amber-500/5 text-amber-900" : "border-sky-500/20 bg-sky-500/5 text-muted-foreground"}`}><strong className="text-foreground">النطاق: {callCenter.forecastScope.label}</strong><span className="mx-2">·</span>{callCenter.forecastScope.message}<span className="ms-2 text-[10px]">({callCenter.forecastScope.matchedReports.toLocaleString("ar-SA")} تقرير مطابق)</span></div> : null}
                  {callCenter?.forecast.latest ? (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["المعروض", callCenter.forecast.latest.offered.toLocaleString("ar-SA")],
                        ["الفائت التقريبي", `${(callCenter.forecast.latest.missedProxyRate * 100).toFixed(1)}%`],
                        ["مكالمة لكل ساعة", callCenter.forecast.latest.callsPerLoggedHour.toFixed(1)],
                        ["ساعات التغطية", callCenter.forecast.latest.loggedHours.toFixed(1)],
                      ].map(([label, value]) => <div key={label} className="rounded-xl bg-secondary/35 p-3"><strong className="block text-xl">{value}</strong><span className="text-[10px] text-muted-foreground">{label}</span></div>)}
                    </div>
                  ) : null}

                  {forecastChart.length ? (
                    <div className="mt-5 h-72 w-full" dir="ltr" aria-label="رسم توقع المكالمات لسبعة أيام">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={forecastChart} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                          <defs>
                            <linearGradient id="actualCalls" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} /><stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} /></linearGradient>
                            <linearGradient id="predictedCalls" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#d4a017" stopOpacity={0.35} /><stop offset="95%" stopColor="#d4a017" stopOpacity={0.02} /></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Area name="فعلي" type="monotone" dataKey="actual" stroke="#0f766e" fill="url(#actualCalls)" connectNulls={false} />
                           <Area name="متوقع" type="monotone" dataKey="predicted" stroke="#d4a017" fill="url(#predictedCalls)" connectNulls={false} />
                           <Area name="الحد الأدنى" type="monotone" dataKey="lower" stroke="#d4a017" fill="none" strokeDasharray="4 4" connectNulls={false} />
                           <Area name="الحد الأعلى" type="monotone" dataKey="upper" stroke="#d4a017" fill="none" strokeDasharray="4 4" connectNulls={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="mt-5 grid min-h-48 place-items-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      <div><Activity className="mx-auto mb-3 h-7 w-7 text-primary" /><p>لا نصنع توقعًا من بيانات ناقصة.</p><small>{forecastScope.kind === "overall" ? "ارفع تقارير Avaya يومية لسبعة أيام على الأقل؛ ويفضل 21 إلى 42 يومًا لثقة أعلى." : (callCenter?.forecastScope.message || "لا توجد بيانات Queue/Skill مطابقة لهذا النطاق.")}</small></div>
                    </div>
                  )}

                  {callCenter ? <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] leading-6 text-muted-foreground"><strong className="text-foreground">تعريف المؤشر:</strong> {callCenter.forecast.definitions.missedProxy}</div> : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-background p-4 md:p-5">
                    <h2 className="flex items-center gap-2 font-bold"><Cable className="h-5 w-5 text-primary" />بوابة Avaya المعتمدة</h2>
                    <div className="mt-4 space-y-3 text-xs leading-6">
                      <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">المنتج</span><strong className="text-end">{callCenter?.avaya.product || "جاري التحقق"}</strong></div>
                      <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">تقارير ACD</span><strong className={callCenter?.avaya.reportSyncConfigured ? "text-emerald-700" : "text-amber-700"}>{callCenter?.avaya.reportSyncConfigured ? "مهيأة" : "بانتظار AVAYA_SYNC_KEY"}</strong></div>
                      <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">قيد شبكة الإدارة</span><strong className={callCenter?.avaya.network.mode === "enforce" && callCenter.avaya.network.trusted ? "text-emerald-700" : "text-amber-700"}>{callCenter?.avaya.network.mode === "enforce" ? (callCenter.avaya.network.trusted ? "مفعل والشبكة موثوقة" : "مفعل خارج الشبكة") : callCenter?.avaya.network.mode === "observe" ? "مراقبة فقط" : "غير مفعل بعد"}</strong></div>
                    </div>
                    {callCenter?.avaya.launchUrl ? <a href={callCenter.avaya.launchUrl} target="_blank" rel="noopener noreferrer" className={`${primaryButton} mt-4 w-full`}><ExternalLink className="h-4 w-4" />فتح Avaya المعتمد</a> : <button type="button" disabled className={`${primaryButton} mt-4 w-full`}><ExternalLink className="h-4 w-4" />{callCenter?.avaya.agentLaunchConfigured ? "اتصل بشبكة الشركة أو VPN الموثوق" : "بانتظار رابط Avaya المصرح"}</button>}
                    <div className="mt-4 space-y-2 rounded-xl bg-secondary/35 p-3 text-[11px] leading-5 text-muted-foreground">
                      <p><strong className="text-foreground">سطح المكتب:</strong> {callCenter?.avaya.browserPolicy.desktopVoice}</p>
                      <p><strong className="text-foreground">Safari:</strong> {callCenter?.avaya.browserPolicy.safari}</p>
                      <p><strong className="text-foreground">الجوال:</strong> {callCenter?.avaya.browserPolicy.mobile}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-background p-4 md:p-5">
                    <h2 className="flex items-center gap-2 font-bold"><TrendingUp className="h-5 w-5 text-primary" />التفسيرات المتوقعة للدروب</h2>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">فرضيات مبنية على الإشارات وليست حكمًا على الموظف أو إثباتًا سببيًا.</p>
                    <div className="mt-3 space-y-2">
                      {callCenter?.forecast.drivers.map((driver) => <article key={driver.id} className={`rounded-xl border p-3 ${driver.severity === "critical" ? "border-red-500/25 bg-red-500/5" : driver.severity === "warning" ? "border-amber-500/25 bg-amber-500/5" : "border-border bg-secondary/25"}`}><div className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${driver.direction === "up" ? "bg-red-500" : driver.direction === "down" ? "bg-emerald-500" : "bg-slate-400"}`} /><div><strong className="block text-xs">{driver.title}</strong><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{driver.explanation}</p><small className="mt-1 block text-[10px] text-primary">{driver.evidence}</small></div></div></article>)}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-background p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="flex items-center gap-2 font-bold"><Network className="h-5 w-5 text-primary" />أدوات الموظفين حسب المشروع</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">الموظف يرى المشاريع المسندة إليه فقط، والأدوات المفعلة لها وحدود اعتماد كل أداة.</p></div>
                  <div className="flex w-full flex-wrap gap-2 md:w-auto"><select className={`${fieldClass} min-w-52`} value={toolProjectId} onChange={(event) => { const id = event.target.value; setToolProjectId(id); const project = workspace.callCenterProjects.find((candidate) => candidate.id === id); if (project) setSelectedIndustry(project.industry); }} aria-label="المشروع المسند"><option value="">معاينة حسب القطاع</option>{workspace.callCenterProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{!toolProjectId ? <select className={`${fieldClass} min-w-48`} value={selectedIndustry} onChange={(event) => setSelectedIndustry(event.target.value as CallCenterIndustry)} aria-label="نوع مشروع مركز الاتصال">{CALL_CENTER_INDUSTRY_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select> : null}</div>
                </div>
                <div className="mt-4 rounded-xl bg-primary/5 p-4"><strong>{selectedToolProject ? `${selectedToolProject.name} · ${selectedProfile.name}` : selectedProfile.name}</strong><p className="mt-1 text-xs leading-6 text-muted-foreground">{selectedProfile.operatingFocus}</p>{selectedToolProject ? <p className="mt-2 text-[11px] text-primary">المسندون: {(selectedToolProject.assignedEmployees || []).join("، ") || "لم يُسند موظفون بعد"}</p> : null}<div className="mt-2 flex flex-wrap gap-2">{selectedProfile.guardrails.map((guardrail) => <span key={guardrail} className="rounded-full border border-primary/15 bg-background px-2.5 py-1 text-[10px]">{guardrail}</span>)}</div></div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{displayedTools.map((tool) => <article key={tool.id} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-2"><strong className="text-sm">{tool.name}</strong><span className="rounded-full bg-secondary px-2 py-1 text-[9px] text-muted-foreground">{approvalLabels[tool.approval]}</span></div><p className="mt-2 text-xs leading-6 text-muted-foreground">{tool.purpose}</p>{selectedToolProject && canManageCallCenter ? <label className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground"><input type="checkbox" checked={(selectedToolProject.enabledToolIds ?? selectedProfile.tools.map((candidate) => candidate.id)).includes(tool.id)} onChange={(event) => { const current = selectedToolProject.enabledToolIds ?? selectedProfile.tools.map((candidate) => candidate.id); const enabledToolIds = event.target.checked ? [...new Set([...current, tool.id])] : current.filter((id) => id !== tool.id); void mutate(() => employeeHub.update<CallCenterProject>("callCenterProjects", selectedToolProject.id, { enabledToolIds }), "تحدثت أدوات المشروع."); }} />مفعلة لهذا المشروع</label> : null}</article>)}{selectedToolProject && !displayedTools.length ? <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground md:col-span-2 xl:col-span-4">لا توجد أدوات مفعلة لهذا المشروع. يفعّلها المشرف بعد اعتماد التكاملات.</div> : null}</div>
              </section>

              <section className="space-y-4">
                {canManageCallCenter ? <form onSubmit={(event) => {
                  event.preventDefault();
                   void mutate(() => employeeHub.create<CallCenterProject>("callCenterProjects", {
                     ...projectDraft,
                      assignedEmployees: projectDraft.assignedEmployees.split(/[,،;\n]+/).map((value) => value.trim()).filter(Boolean),
                      channels: ["voice", "email", "chat", "whatsapp"],
                     avayaForecastMapping: projectDraft.routingIdentifiers.trim() ? {
                       routingKind: projectDraft.routingKind,
                       identifiers: projectDraft.routingIdentifiers.split(/[,،;\n]+/).map((value) => value.trim()).filter(Boolean),
                     } : null,
                     serviceLevelSeconds: Number(projectDraft.serviceLevelSeconds),
                     targetAnswerRate: Number(projectDraft.targetAnswerRate) / 100,
                   }), "أضيف مشروع مركز الاتصال.").then((saved) => {
                     if (saved) setProjectDraft((value) => ({ ...value, name: "", clientName: "", notes: "", assignedEmployees: "", routingIdentifiers: "" }));
                  });
                }} className="grid gap-3 rounded-2xl border border-border bg-secondary/20 p-4 md:grid-cols-2 xl:grid-cols-6">
                  <input required className={fieldClass} placeholder="اسم المشروع" value={projectDraft.name} onChange={(event) => setProjectDraft({ ...projectDraft, name: event.target.value })} />
                  <input required className={fieldClass} placeholder="العميل أو الجهة" value={projectDraft.clientName} onChange={(event) => setProjectDraft({ ...projectDraft, clientName: event.target.value })} />
                  <select className={fieldClass} value={projectDraft.industry} onChange={(event) => { const industry = event.target.value as CallCenterIndustry; setProjectDraft({ ...projectDraft, industry, enabledToolIds: callCenterProfileById(industry).tools.map((tool) => tool.id) }); }}>{CALL_CENTER_INDUSTRY_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>
                  <input className={fieldClass} placeholder="ساعات التشغيل" value={projectDraft.operatingHours} onChange={(event) => setProjectDraft({ ...projectDraft, operatingHours: event.target.value })} />
                  <input type="number" min="5" max="300" className={fieldClass} aria-label="هدف زمن الخدمة بالثواني" value={projectDraft.serviceLevelSeconds} onChange={(event) => setProjectDraft({ ...projectDraft, serviceLevelSeconds: event.target.value })} />
                   <input type="number" min="50" max="100" className={fieldClass} aria-label="هدف نسبة الإجابة" value={projectDraft.targetAnswerRate} onChange={(event) => setProjectDraft({ ...projectDraft, targetAnswerRate: event.target.value })} />
                   <input className={`${fieldClass} md:col-span-2 xl:col-span-3`} placeholder="حسابات الموظفين المسندة، مفصولة بفواصل" value={projectDraft.assignedEmployees} onChange={(event) => setProjectDraft({ ...projectDraft, assignedEmployees: event.target.value.slice(0, 2_000) })} />
                   <select className={fieldClass} aria-label="نوع ربط توقع Avaya" value={projectDraft.routingKind} onChange={(event) => setProjectDraft({ ...projectDraft, routingKind: event.target.value as CallCenterRoutingKind })}><option value="queue">Queue IDs</option><option value="skill">Skill IDs</option></select>
                   <input className={`${fieldClass} md:col-span-1 xl:col-span-2`} dir="ltr" placeholder="معرّفات Avaya مثل queue-101, queue-102" value={projectDraft.routingIdentifiers} onChange={(event) => setProjectDraft({ ...projectDraft, routingIdentifiers: event.target.value.slice(0, 2_000) })} />
                   <textarea rows={2} className={`${textAreaClass} md:col-span-2 xl:col-span-3`} placeholder="ملاحظات النطاق والتصعيد" value={projectDraft.notes} onChange={(event) => setProjectDraft({ ...projectDraft, notes: event.target.value.slice(0, 2_000) })} />
                   <p className="md:col-span-2 xl:col-span-6 text-[10px] leading-5 text-muted-foreground">استخدم معرّفات Queue أو Skill الآلية المعتمدة، لا أسماء الموظفين. الربط وحده لا ينسب البيانات؛ يلزم أن يحمل تقرير Avaya هوية مطابقة.</p>
                  <fieldset className="md:col-span-2 xl:col-span-6"><legend className="mb-2 text-xs font-bold">الأدوات المفعلة مبدئيًا</legend><div className="flex flex-wrap gap-2">{callCenterProfileById(projectDraft.industry).tools.map((tool) => <label key={tool.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs"><input type="checkbox" checked={projectDraft.enabledToolIds.includes(tool.id)} onChange={(event) => setProjectDraft((value) => ({ ...value, enabledToolIds: event.target.checked ? [...new Set([...value.enabledToolIds, tool.id])] : value.enabledToolIds.filter((id) => id !== tool.id) }))} />{tool.name}</label>)}</div></fieldset>
                  <button disabled={busy} className={primaryButton}><Plus className="h-4 w-4" />إضافة مشروع</button>
                </form> : null}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {workspace.callCenterProjects.map((project) => {
                    const profile = callCenterProfileById(project.industry);
                    const assignmentValue = assignmentDrafts[project.id] ?? (project.assignedEmployees || []).join("، ");
                    const enabledCount = project.enabledToolIds?.length ?? profile.tools.length;
                    const routingDraft = routingDrafts[project.id] ?? {
                      routingKind: project.avayaForecastMapping?.routingKind || "queue",
                      identifiers: (project.avayaForecastMapping?.identifiers || []).join(", "),
                    };
                    const routingLabel = project.avayaForecastMapping?.routingKind === "skill" ? "Skill" : "Queue";
                    return (
                      <article key={project.id} className="rounded-2xl border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold text-primary">{profile.name}</span><h3 className="font-bold">{project.name}</h3><p className="text-xs text-muted-foreground">{project.clientName}</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px]">{projectStatusLabels[project.status]}</span></div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground"><span>الخدمة: {(project.targetAnswerRate * 100).toFixed(0)}% خلال {project.serviceLevelSeconds}ث</span><span>الساعات: {project.operatingHours}</span><span>{(project.assignedEmployees || []).length} موظف مسند</span><span>{enabledCount} أداة مفعلة</span></div>
                        <p className="mt-3 rounded-lg bg-secondary/30 p-2 text-[10px] text-muted-foreground">ربط التوقع: {project.avayaForecastMapping?.identifiers.length ? `${routingLabel} · ${project.avayaForecastMapping.identifiers.join("، ")}` : "غير مهيأ — لن تُنسب تقارير للمشروع"}</p>
                        {project.notes ? <p className="mt-3 text-xs leading-6">{project.notes}</p> : null}
                        {canManageCallCenter ? <div className="mt-3 flex gap-2"><input className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-secondary px-2 text-xs" aria-label={`موظفو ${project.name}`} placeholder="الموظفون بفواصل" value={assignmentValue} onChange={(event) => setAssignmentDrafts((value) => ({ ...value, [project.id]: event.target.value }))} /><button type="button" disabled={busy} onClick={() => void mutate(() => employeeHub.update<CallCenterProject>("callCenterProjects", project.id, { assignedEmployees: assignmentValue.split(/[,،;\n]+/).map((value) => value.trim()).filter(Boolean) }), "حُفظ إسناد الموظفين للمشروع.")} className="h-9 rounded-lg border border-primary/25 px-3 text-xs font-bold text-primary">حفظ الإسناد</button></div> : <p className="mt-3 text-[11px] text-muted-foreground">المسندون: {(project.assignedEmployees || []).join("، ") || "أنت ضمن الوصول المصرح"}</p>}
                        {canManageCallCenter ? <div className="mt-2 grid grid-cols-[96px_1fr_auto] gap-2"><select className="h-9 rounded-lg border border-border bg-secondary px-2 text-xs" aria-label={`نوع ربط ${project.name}`} value={routingDraft.routingKind} onChange={(event) => setRoutingDrafts((value) => ({ ...value, [project.id]: { ...routingDraft, routingKind: event.target.value as CallCenterRoutingKind } }))}><option value="queue">Queue</option><option value="skill">Skill</option></select><input className="h-9 min-w-0 rounded-lg border border-border bg-secondary px-2 text-xs" dir="ltr" aria-label={`معرّفات Avaya لمشروع ${project.name}`} placeholder="queue-101, queue-102" value={routingDraft.identifiers} onChange={(event) => setRoutingDrafts((value) => ({ ...value, [project.id]: { ...routingDraft, identifiers: event.target.value } }))} /><button type="button" disabled={busy} onClick={() => void mutate(() => employeeHub.update<CallCenterProject>("callCenterProjects", project.id, { avayaForecastMapping: routingDraft.identifiers.trim() ? { routingKind: routingDraft.routingKind, identifiers: routingDraft.identifiers.split(/[,،;\n]+/).map((value) => value.trim()).filter(Boolean) } : null }), "تحدث ربط توقع Avaya للمشروع.")} className="h-9 rounded-lg border border-primary/25 px-3 text-xs font-bold text-primary">حفظ الربط</button></div> : null}
                        <div className="mt-4 flex gap-2"><button type="button" onClick={() => { setSelectedIndustry(project.industry); setToolProjectId(project.id); }} className="h-9 flex-1 rounded-lg border border-primary/25 px-3 text-xs font-bold text-primary">عرض الأدوات</button>{canManageCallCenter ? <select value={project.status} onChange={(event) => void mutate(() => employeeHub.update<CallCenterProject>("callCenterProjects", project.id, { status: event.target.value }), "تحدثت حالة المشروع.")} className="h-9 rounded-lg border border-border bg-secondary px-2 text-xs"><option value="design">تصميم</option><option value="pilot">تجريبي</option><option value="active">نشط</option><option value="paused">موقوف</option></select> : null}{canManageCallCenter ? <button type="button" onClick={() => void mutate(() => employeeHub.remove("callCenterProjects", project.id), "حُذف مشروع مركز الاتصال.")} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive" aria-label="حذف مشروع مركز الاتصال"><Trash2 className="h-4 w-4" /></button> : null}</div>
                      </article>
                    );
                  })}
                </div>
                {!workspace.callCenterProjects.length ? <div className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-border text-center text-sm text-muted-foreground">لا توجد مشاريع محفوظة بعد. يمكن للمشرف إنشاء أول ملف مشروع من الأعلى.</div> : null}
              </section>

              {session?.role === "superadmin" ? <section className="rounded-2xl border border-border bg-background p-4 md:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-primary" />إدارة النسخ الاحتياطية المشفرة</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">لقطات يومية لمساحة التشغيل لمدة 30 يومًا. الاستعادة تعيد السجلات المفقودة فقط ولا تستبدل الموجود.</p></div><button type="button" disabled={busy} onClick={() => void mutate(() => employeeHub.createBackup(), "أُنشئت لقطة تشغيل مشفرة الآن.")} className={primaryButton}><Plus className="h-4 w-4" />إنشاء لقطة الآن</button></div><div className="mt-4 space-y-2">{backups.slice(0, 10).map((backup) => <article key={backup.snapshotId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 p-3"><div><strong className="block text-sm">{new Date(backup.createdAt).toLocaleString("ar-SA")}</strong><span className="text-[10px] text-muted-foreground">{backup.recordCount} سجل · مشفرة داخل مزود Netlify</span></div><button type="button" disabled={busy} onClick={() => { if (window.confirm("هل تريد استعادة السجلات المفقودة فقط من هذه اللقطة؟ لن يُستبدل أي سجل موجود.")) void mutate(() => employeeHub.restoreBackup(backup.snapshotId), "اكتملت استعادة السجلات المفقودة من اللقطة."); }} className="h-9 rounded-lg border border-primary/25 px-3 text-xs font-bold text-primary">استعادة المفقود</button></article>)}{!backups.length ? <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">لا توجد لقطة بعد؛ ستنشئ الوظيفة المجدولة أول لقطة بعد النشر، أو أنشئها يدويًا الآن.</div> : null}</div><p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-6 text-muted-foreground"><strong className="text-foreground">حد الحماية:</strong> هذه النسخة لمساحة تشغيل الموظفين داخل المزود نفسه، ولا تشمل الصوت الخام أو مراجعات المكالمات المحتفظ بها 90 يومًا. النسخة المستقلة 3-2-1 تحتاج وجهة شركة ثانية معتمدة.</p></section> : null}
            </div>
          ) : null}

          {tab === "calls" ? (
            <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
              <div className="rounded-2xl border border-border bg-background p-4">
                <h2 className="flex items-center gap-2 font-bold"><Headphones className="h-5 w-5 text-primary" />تحليل بواسطة مستمعَين</h2>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">ارفع صوتًا حتى 4 MB أو ملف TXT/MD. الصوت يُرسل إلى OpenAI للتفريغ، لكنه لا يُحفظ خامًا في مساحة التطبيق. قبل التحليل نحجب أنماط الدفع والجوال والهوية وOTP والبريد والأسرار، ونحتفظ بالنتيجة المنقحة 90 يومًا.</p>
                <div className="mt-4 space-y-3"><input className={fieldClass} placeholder="اسم الموظف" value={callEmployee} disabled={!canManageQuality} onChange={(event) => setCallEmployee(event.target.value)} /><input key={callInputKey} type="file" accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.txt,.md" onChange={(event) => setCallFile(event.target.files?.[0] || null)} className="block w-full rounded-xl border border-dashed border-border bg-secondary/20 p-3 text-xs" /><textarea rows={4} className={textAreaClass} placeholder="ملاحظات الجودة أو المشرف (اختياري)" value={supervisorNotes} onChange={(event) => setSupervisorNotes(event.target.value.slice(0, 4_000))} /><label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={callAuthorized} onChange={(event) => setCallAuthorized(event.target.checked)} className="mt-1" /><span>أؤكد أن تسجيل المكالمة ومراجعتها مصرح بهما وفق سياسة الجهة، وأوافق على إرسال الصوت لخدمة التفريغ.</span></label><button type="button" disabled={!canEdit || busy || !callFile || !callAuthorized} onClick={() => void reviewCall()} className={`${primaryButton} w-full`}><Headphones className="h-4 w-4" />{busy ? "جاري التفريغ والتحليل…" : "بدء المراجعة"}</button></div>
              </div>
              <div className="space-y-4">
                {workspace.callReviews.slice(0, 5).map((review) => <article key={review.id} className="rounded-2xl border border-border bg-background p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><strong>{review.employeeName}</strong><span className="flex items-center gap-3 text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleString("ar-SA")}{canDelete ? <button type="button" onClick={() => void mutate(() => employeeHub.remove("callReviews", review.id), "حُذفت مراجعة المكالمة.")} className="hover:text-destructive" aria-label="حذف مراجعة المكالمة"><Trash2 className="h-4 w-4" /></button> : null}</span></div><div className="grid gap-3 xl:grid-cols-2"><div className="rounded-xl bg-secondary/30 p-3"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-primary" />الإجراءات والامتثال</h3><p className="whitespace-pre-wrap text-xs leading-6">{review.complianceReview}</p></div><div className="rounded-xl bg-secondary/30 p-3"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><HeartHandshake className="h-4 w-4 text-primary" />تجربة الضيف</h3><p className="whitespace-pre-wrap text-xs leading-6">{review.experienceReview}</p></div></div></article>)}
                {!workspace.callReviews.length ? <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">لا توجد مراجعات محفوظة بعد.</div> : null}
              </div>
            </div>
          ) : null}

          {tab === "quality" ? (
            <div className="space-y-5">
              {canEdit ? <form onSubmit={(event) => { event.preventDefault(); void mutate(() => employeeHub.create<EmployeeQualityNote>("qualityNotes", qualityDraft), "حُفظت ملاحظة الجودة.").then((saved) => { if (saved) setQualityDraft((value) => ({ ...value, score: "", note: "" })); }); }} className="grid gap-3 rounded-2xl border border-border bg-secondary/20 p-4 md:grid-cols-4"><input required className={fieldClass} placeholder="اسم الموظف" value={qualityDraft.employeeName} disabled={!canManageQuality} onChange={(event) => setQualityDraft({ ...qualityDraft, employeeName: event.target.value })} /><input className={fieldClass} placeholder="التصنيف" value={qualityDraft.category} onChange={(event) => setQualityDraft({ ...qualityDraft, category: event.target.value })} /><input type="number" min="0" max="100" className={fieldClass} placeholder="الدرجة من 100" value={qualityDraft.score} onChange={(event) => setQualityDraft({ ...qualityDraft, score: event.target.value })} /><button disabled={busy || !qualityDraft.note.trim()} className={primaryButton}><CheckCircle2 className="h-4 w-4" />حفظ</button><textarea required rows={3} className={`${textAreaClass} md:col-span-4`} placeholder="الملاحظة والسلوك المطلوب تثبيته أو تحسينه…" value={qualityDraft.note} onChange={(event) => setQualityDraft({ ...qualityDraft, note: event.target.value.slice(0, 2_000) })} /></form> : null}
              <div className="grid gap-3 md:grid-cols-2">{workspace.qualityNotes.map((note) => <article key={note.id} className="rounded-2xl border border-border bg-background p-4"><div className="flex items-start justify-between gap-3"><div><strong className="block text-sm">{note.employeeName}</strong><span className="text-xs text-primary">{note.category}{note.score !== null ? ` · ${note.score}/100` : ""}</span></div>{canDelete ? <button type="button" onClick={() => void mutate(() => employeeHub.remove("qualityNotes", note.id), "حُذفت الملاحظة.")} className="text-muted-foreground hover:text-destructive" aria-label="حذف"><Trash2 className="h-4 w-4" /></button> : null}</div><p className="mt-3 text-sm leading-7">{note.note}</p><small className="mt-2 block text-muted-foreground">{note.createdBy} · {new Date(note.createdAt).toLocaleDateString("ar-SA")}</small></article>)}</div>
            </div>
          ) : null}

          {tab === "marketing" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <h2 className="flex items-center gap-2 font-bold"><BriefcaseBusiness className="h-5 w-5 text-primary" />إدارة الاستشارات التسويقية الخاصة</h2>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">هذه السجلات تظهر لك وحدك. يبدأ العمل بالتشخيص والعرض، ولا يسمح النظام بتحويل المشروع إلى «قيد التنفيذ» قبل اعتماد الاتفاق أو تفعيل العقد.</p>
              </div>
              {canEdit ? <form onSubmit={(event) => { event.preventDefault(); void mutate(() => employeeHub.create("marketingEngagements", marketingDraft), "أضيف مشروع الاستشارة إلى مساحتك الخاصة.").then((saved) => { if (saved) setMarketingDraft((value) => ({ ...value, clientName: "", projectName: "", contractReference: "", value: "", objective: "", deliverables: "", plan: "" })); }); }} className="grid gap-3 rounded-2xl border border-border bg-secondary/20 p-4 md:grid-cols-2 xl:grid-cols-4">
                <input required className={fieldClass} placeholder="اسم العميل أو المنشأة" value={marketingDraft.clientName} onChange={(event) => setMarketingDraft({ ...marketingDraft, clientName: event.target.value })} />
                <input required className={fieldClass} placeholder="اسم المشروع" value={marketingDraft.projectName} onChange={(event) => setMarketingDraft({ ...marketingDraft, projectName: event.target.value })} />
                <input className={fieldClass} placeholder="نوع الخدمة" value={marketingDraft.serviceType} onChange={(event) => setMarketingDraft({ ...marketingDraft, serviceType: event.target.value })} />
                <div className="flex gap-2"><input type="number" min="0" step="0.01" className={fieldClass} placeholder="قيمة العقد" value={marketingDraft.value} onChange={(event) => setMarketingDraft({ ...marketingDraft, value: event.target.value })} /><input className={`${fieldClass} max-w-20`} dir="ltr" value={marketingDraft.currency} onChange={(event) => setMarketingDraft({ ...marketingDraft, currency: event.target.value })} /></div>
                <select className={fieldClass} value={marketingDraft.contractStatus} onChange={(event) => setMarketingDraft({ ...marketingDraft, contractStatus: event.target.value })}><option value="draft">مسودة اتفاق</option><option value="agreed">متفق عليه</option><option value="active">عقد فعال</option><option value="completed">عقد مكتمل</option></select>
                <input className={fieldClass} placeholder="مرجع العقد أو العرض" value={marketingDraft.contractReference} onChange={(event) => setMarketingDraft({ ...marketingDraft, contractReference: event.target.value })} />
                <input className={`${fieldClass} md:col-span-2`} placeholder="الهدف التسويقي القابل للقياس" value={marketingDraft.objective} onChange={(event) => setMarketingDraft({ ...marketingDraft, objective: event.target.value })} />
                <textarea rows={3} className={`${textAreaClass} md:col-span-2`} placeholder="التسليمات المتفق عليها" value={marketingDraft.deliverables} onChange={(event) => setMarketingDraft({ ...marketingDraft, deliverables: event.target.value })} />
                <textarea rows={3} className={`${textAreaClass} md:col-span-2`} placeholder="الخطة أو الملاحظات الأولية" value={marketingDraft.plan} onChange={(event) => setMarketingDraft({ ...marketingDraft, plan: event.target.value })} />
                <button disabled={busy} className={`${primaryButton} md:col-span-2 xl:col-span-4`}><Plus className="h-4 w-4" />إنشاء ملف الاستشارة</button>
              </form> : null}
              <div className="grid gap-4 lg:grid-cols-2">{workspace.marketingEngagements.map((engagement) => <article key={engagement.id} className="rounded-2xl border border-border bg-background p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold text-primary">{engagement.serviceType}</span><h3 className="font-bold">{engagement.projectName}</h3><p className="text-xs text-muted-foreground">{engagement.clientName}</p></div><strong className="text-sm">{engagement.value !== null ? `${engagement.value.toLocaleString("ar-SA")} ${engagement.currency}` : "قيد التسعير"}</strong></div>
                {engagement.objective ? <p className="mt-3 rounded-xl bg-secondary/30 p-3 text-xs leading-6"><strong>الهدف:</strong> {engagement.objective}</p> : null}
                {engagement.deliverables ? <p className="mt-2 text-xs leading-6"><strong>التسليمات:</strong> {engagement.deliverables}</p> : null}
                {engagement.plan ? <p className="mt-2 whitespace-pre-wrap text-xs leading-6"><strong>الخطة:</strong> {engagement.plan}</p> : null}
                <div className="mt-4 grid grid-cols-2 gap-2"><label className="text-[10px] text-muted-foreground">العقد<select disabled={!canEdit} value={engagement.contractStatus} onChange={(event) => void mutate(() => employeeHub.update("marketingEngagements", engagement.id, { contractStatus: event.target.value }), "تحدثت حالة العقد.")} className="mt-1 h-9 w-full rounded-lg border border-border bg-secondary px-2 text-xs"><option value="draft">مسودة</option><option value="agreed">متفق عليه</option><option value="active">فعال</option><option value="completed">مكتمل</option></select></label><label className="text-[10px] text-muted-foreground">المشروع<select disabled={!canEdit} value={engagement.status} onChange={(event) => void mutate(() => employeeHub.update("marketingEngagements", engagement.id, { status: event.target.value }), "تحدثت حالة المشروع.")} className="mt-1 h-9 w-full rounded-lg border border-border bg-secondary px-2 text-xs"><option value="lead">فرصة</option><option value="proposal">عرض</option><option value="contracted">متعاقد</option><option value="executing">قيد التنفيذ</option><option value="completed">مكتمل</option></select></label></div>
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setSelectedAgent("task_board"); setSelectedMarketingId(engagement.id); setPrompt(`قدّم استشارة وابنِ خطة تنفيذ للمشروع ${engagement.projectName} للعميل ${engagement.clientName}. الهدف: ${engagement.objective || "غير محدد"}. نطاق التسليمات: ${engagement.deliverables || "غير محدد"}. حالة العقد: ${engagement.contractStatus}. التزم بالنطاق ولا تبدأ تنفيذًا غير متفق عليه.`); setTab("agents"); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/30 px-3 text-xs font-bold text-primary"><Sparkles className="h-4 w-4" />إنشاء خطة بالوكيل</button>{canEdit ? <button type="button" onClick={() => void mutate(() => employeeHub.remove("marketingEngagements", engagement.id), "حُذف مشروع الاستشارة الخاص.")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" />حذف</button> : null}</div>
              </article>)}</div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default EmployeeAssistant;
