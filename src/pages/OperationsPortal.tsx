import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, BookOpen, CheckCircle2, ClipboardList, Clock3, Headphones, MessageSquare, ShieldAlert, UserRoundPlus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { publicBranches } from "@/data/publicBranches";
import { operationKinds, operationStatuses, type OperationKind, type OperationsData } from "@/lib/operationsTypes";
import { workplaceRequest } from "@/lib/workplaceApi";

const sections = [
  { id: "overview", label: "مساحة العمل", icon: ClipboardList },
  { id: "calls", label: "المكالمات والبروتوكول", icon: Headphones },
  { id: "escalation", label: "تصعيد الشكاوى", icon: ShieldAlert },
  { id: "cancellation", label: "سياسات الإلغاء", icon: BookOpen },
  { id: "feedback", label: "التغذية الراجعة", icon: MessageSquare },
  { id: "arrival", label: "الدخول المبكر", icon: Clock3 },
  { id: "leads", label: "العملاء المحتملون", icon: UserRoundPlus },
  { id: "requests", label: "طلبات المشرفين", icon: ClipboardList },
];
const fieldClass = "w-full mt-2 h-11 rounded-xl border bg-secondary/40 px-3 text-sm";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const stamp = (value: string) => new Date(value).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
const branchName = (id: string) => publicBranches.find((b) => b.id === id)?.name || "عام";
function Field({ label, name, type = "text", required = false, maxLength = 200, defaultValue }: { label: string; name: string; type?: string; required?: boolean; maxLength?: number; defaultValue?: string }) {
  return <label className="block text-sm">{label}<input name={name} type={type} required={required} maxLength={maxLength} defaultValue={defaultValue} className={fieldClass} dir={type === "tel" || type === "email" ? "ltr" : "auto"} /></label>;
}
function BranchField({ required = false }: { required?: boolean }) {
  return <label className="block text-sm">الفرع<select name="branchId" required={required} className={fieldClass} defaultValue=""><option value="">{required ? "اختر الفرع" : "عام / اختر الفرع"}</option>{publicBranches.map((b) => <option value={b.id} key={b.id}>{b.name} · {b.city}</option>)}</select></label>;
}

export default function OperationsPortal() {
  const [params, setParams] = useSearchParams();
  const section = sections.some((s) => s.id === params.get("section")) ? params.get("section")! : "overview";
  const [data, setData] = useState<OperationsData | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [route, setRoute] = useState<number | null>(null), [clock, setClock] = useState(Date.now());
  const load = async () => { setError(""); try { setData(await workplaceRequest<OperationsData>("/api/employee/operations")); } catch (e) { setData(null); setError((e as Error).message); } };
  useEffect(() => { void load(); const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const choose = (value: string) => { setParams({ section: value }); setNotice(""); setError(""); setRoute(null); };
  const submit = async (event: React.FormEvent<HTMLFormElement>, extra: Record<string, unknown>, method = "POST") => {
    event.preventDefault(); const form = event.currentTarget;
    const fields: Record<string, unknown> = Object.fromEntries(new FormData(form));
    if (fields.dueAt) fields.dueAt = new Date(String(fields.dueAt)).toISOString();
    setBusy(true); setError(""); setNotice("");
    try { await workplaceRequest("/api/employee/operations", { ...fields, ...extra }, method); if (method === "POST") form.reset(); setNotice(method === "PATCH" ? "تم تحديث الطلب." : "تم حفظ الطلب بنجاح."); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const kind: OperationKind | null = ({ feedback: "feedback", arrival: "early_checkin", leads: "lead", requests: "supervisor_request" } as Record<string, OperationKind>)[section] || null;
  const records = data?.records.filter((r) => !kind || r.kind === kind) || [];
  const currentAvailability = data?.availability.filter((r) => Date.parse(r.validUntil) > clock && r.serviceDate >= today()) || [];

  return <div className="page-wrap space-y-5"><PageHeader title="مساحة موظفي الحجز" icon={Headphones} actions={<Link to="/assistant" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm">اسأل المساعد</Link>} />
    <nav aria-label="أقسام مساحة العمل" className="flex gap-2 overflow-x-auto pb-2">{sections.map((s) => <button key={s.id} onClick={() => choose(s.id)} aria-current={section === s.id ? "page" : undefined} className={`shrink-0 flex gap-2 items-center rounded-xl border px-4 py-3 text-sm ${section === s.id ? "bg-primary text-primary-foreground" : "bg-card"}`}><s.icon className="w-4 h-4" />{s.label}</button>)}</nav>
    <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{sections.find((s) => s.id === section)?.label}</h2><button className="text-sm rounded-xl border px-3 py-2" onClick={() => void load()}>تحديث البيانات</button></div>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-primary/10 p-4 text-primary flex gap-2"><CheckCircle2 className="h-5 w-5" />{notice}</p>}
    {!data ? !error && <p>جاري تحميل مساحة العمل…</p> : <>
      {section === "overview" && <>
        <p className="text-muted-foreground">ابدأ بالإجراء المطلوب، تابع طلباتك، وارجع إلى المساعد ودليل الفروع في أي وقت.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Object.entries(operationKinds).map(([id, label]) => <button key={id} onClick={() => choose(({ feedback: "feedback", early_checkin: "arrival", lead: "leads", supervisor_request: "requests" })[id])} className="page-surface text-right"><span className="text-xs text-muted-foreground">{label}</span><strong className="block text-3xl my-2">{data.records.filter((r) => r.kind === id && ["open", "in_progress"].includes(r.status)).length}</strong><small>طلبات مفتوحة ضمن صلاحيتك</small></button>)}</div>
        <div className="grid sm:grid-cols-2 gap-3">{sections.slice(1).map((s) => <button key={s.id} onClick={() => choose(s.id)} className="page-surface flex gap-3 items-center text-right"><s.icon className="h-6 w-6 text-primary" /><strong className="flex-1">{s.label}</strong><ArrowLeft className="h-4 w-4" /></button>)}<Link to="/branches" className="page-surface font-bold">دليل الفروع وأرقام الاستقبال ←</Link></div>
      </>}
      {["calls", "escalation", "cancellation"].includes(section) && <div className="rounded-xl border border-amber-300/50 bg-amber-50/40 p-4 text-sm space-y-2"><strong>{data.guide.title} — {data.guide.version} · {data.guide.status}</strong><p className="leading-7 text-muted-foreground">{data.guide.governance}</p></div>}
      {section === "calls" && <>
        <section className="page-surface space-y-4"><h3 className="font-bold text-lg">خريطة بروتوكول المكالمة</h3><ol className="grid gap-2">{data.guide.steps.map((step, i) => <li key={step.title}><div className="rounded-xl border p-4 flex gap-3"><span className="rounded-full bg-primary/10 text-primary h-8 w-8 shrink-0 grid place-items-center font-bold">{i + 1}</span><div><h4 className="font-bold">{step.title}</h4><p className="text-sm leading-7 text-muted-foreground">{step.text}</p></div></div>{i < data.guide.steps.length - 1 && <ArrowDown aria-hidden className="h-4 w-4 mx-8 my-1 text-primary" />}</li>)}</ol></section>
        <section className="page-surface space-y-4"><h3 className="font-bold">اختر نوع المكالمة</h3><div className="grid sm:grid-cols-2 gap-2">{data.guide.routes.map((r, i) => <button key={r.title} aria-pressed={route === i} onClick={() => setRoute(i)} className={`rounded-xl border p-3 text-right ${route === i ? "bg-primary/10 border-primary" : ""}`}>{r.title}</button>)}</div>{route !== null && <div className="rounded-xl bg-secondary/60 p-4 leading-8"><h4 className="font-bold">{data.guide.routes[route].title}</h4><p>{data.guide.routes[route].text}</p><button onClick={() => setRoute(null)} className="text-primary text-sm mt-2">العودة لاختيار المسار</button></div>}</section>
        <section className="grid sm:grid-cols-2 gap-3">{data.guide.phrases.map((p) => <article className="page-surface" key={p.title}><h3 className="font-bold mb-2">{p.title}</h3><p className="text-sm leading-7">{p.text}</p></article>)}</section>
      </>}
      {section === "escalation" && <><div className="grid lg:grid-cols-3 gap-3">{data.guide.escalation.map((e) => <article key={e.level} className="page-surface space-y-3"><span className="inline-block rounded-full bg-secondary px-3 py-1 font-bold">{e.level}</span><p className="text-sm leading-7">{e.cases}</p><p className="text-sm leading-7 text-primary">{e.action}</p></article>)}</div><section className="page-surface"><h3 className="font-bold mb-3">ملف التصعيد</h3><ul className="list-disc pr-5 space-y-3 text-sm">{data.guide.escalationFields.map((field) => <li key={field}>{field}</li>)}</ul><Link to="/complaints" className="inline-flex mt-5 rounded-xl bg-primary text-primary-foreground px-5 py-3">فتح نموذج الشكوى</Link></section></>}
      {section === "cancellation" && <section className="page-surface space-y-4"><p className="leading-7">حدد مصدر الحجز أولًا، ثم راجع شروط السعر والسداد والسياسة النافذة للحجز نفسه. راجع مدة الإلغاء ورسومه في شروط الحجز نفسه.</p><div className="overflow-x-auto"><table className="w-full text-sm text-right min-w-[620px]"><thead><tr className="border-b"><th className="p-3">مصدر الحجز / الحالة</th><th className="p-3">مسار الإجراء</th><th className="p-3">حد الصلاحية</th></tr></thead><tbody>{data.guide.cancellation.map((r) => <tr className="border-b" key={r.source}><th className="p-3 align-top">{r.source}</th><td className="p-3 leading-7 align-top">{r.action}</td><td className="p-3 leading-7 align-top text-muted-foreground">{r.limit}</td></tr>)}</tbody></table></div></section>}
      {section === "arrival" && <>
        <div className="page-surface space-y-3"><h3 className="font-bold">تأكيدات الاستقبال الحالية</h3><p className="text-sm leading-7 text-muted-foreground">المساعد يقرأ التأكيدات الحديثة أدناه حسب الفرع وتاريخ الوصول. التوفر قابل للتغير؛ تقرير الحجوزات لا يثبت جاهزية الغرف.</p>
          {!currentAvailability.length ? <p className="text-sm">لا يوجد تأكيد استقبال ساري حاليًا. تواصل مع الفرع أو سجل طلب دخول مبكر.</p> : currentAvailability.map((r) => <article className="rounded-xl border p-4 space-y-2" key={`${r.branchId}-${r.serviceDate}`}><h4 className="font-bold">{branchName(r.branchId)} · {r.serviceDate}</h4><p>{r.status === "available" ? `الدخول المبكر متاح من ${r.fromTime}` : "الدخول المبكر غير متاح حسب آخر تأكيد"}</p><p className="text-sm">{r.note}</p><p className="text-xs text-muted-foreground">تأكيد استقبال راجعه المشرف · {stamp(r.verifiedAt)} · ينتهي {stamp(r.validUntil)}</p></article>)}
          <Link to="/branches" className="inline-block text-primary text-sm">أرقام الاستقبال ودليل الفروع</Link>
        </div>
        {data.canManage && <details className="page-surface"><summary className="font-bold cursor-pointer">تسجيل تأكيد توفر من الاستقبال</summary><form className="mt-4 space-y-4" onSubmit={(event) => void submit(event, { action: "availability" })}><div className="grid sm:grid-cols-2 gap-4"><BranchField required /><Field name="serviceDate" label="تاريخ الوصول" type="date" defaultValue={today()} required /><Field name="fromTime" label="من الساعة (الرياض)" type="time" required /><label className="text-sm">نتيجة التحقق<select name="status" className={fieldClass}><option value="available">متاح بحسب تأكيد الفرع</option><option value="unavailable">غير متاح بحسب تأكيد الفرع</option></select></label><Field name="reference" label="مرجع التأكيد من الاستقبال" required /><label className="text-sm">مدة صلاحية التأكيد<select name="validMinutes" className={fieldClass} defaultValue="30"><option value="15">15 دقيقة</option><option value="30">30 دقيقة</option><option value="60">ساعة</option><option value="120">ساعتان</option></select></label></div><Field name="note" label="نوع الغرفة وشروط الفرع أو ملاحظاته" maxLength={600} /><button disabled={busy} className="rounded-xl bg-primary text-primary-foreground px-5 h-11 disabled:opacity-50">حفظ تأكيد الاستقبال</button></form></details>}
      </>}
      {kind && <>
        {kind !== "supervisor_request" || data.canManage ? <details className="page-surface" open={records.length === 0}><summary className="font-bold cursor-pointer">إضافة {operationKinds[kind]}</summary><form key={kind} className="mt-4 space-y-4" onSubmit={(event) => void submit(event, { kind })}>
          <div className="grid sm:grid-cols-2 gap-4"><Field name="subject" label="عنوان الطلب" maxLength={140} required /><BranchField required={kind === "early_checkin"} />
            {(kind === "early_checkin" || kind === "lead") && <><Field name="serviceDate" label="تاريخ الوصول" type="date" required={kind === "early_checkin"} /><Field name="requestedTime" label="وقت الوصول المطلوب (الرياض)" type="time" required={kind === "early_checkin"} /><Field name="guestName" label="اسم الضيف" required={kind === "lead"} maxLength={100} /><Field name="guestPhone" label="رقم تواصل الضيف" type="tel" required={kind === "lead"} maxLength={30} /></>}
            {kind !== "feedback" && <Field name="dueAt" label="موعد المتابعة (توقيت جهازك)" type="datetime-local" required={kind === "lead"} />}
            {data.canManage && <Field name="assignee" label="البريد أو اسم حساب الموظف المكلف" required={kind === "supervisor_request"} defaultValue={data.username} maxLength={120} />}
          </div><label className="text-sm block">{kind === "feedback" ? "الملاحظة أو اقتراح التحسين" : "تفاصيل الطلب والنتيجة المطلوبة"}<textarea required name="details" maxLength={2000} rows={4} className="w-full mt-2 rounded-xl border bg-secondary/40 p-3" /></label>
          <p className="text-xs text-muted-foreground">أدخل المعلومات اللازمة للمتابعة فقط. لا تدخل بيانات بطاقة أو رمز تحقق أو كلمة مرور.</p>
          <button disabled={busy} className="rounded-xl bg-primary text-primary-foreground px-5 h-11 disabled:opacity-50">{busy ? "جاري الحفظ…" : "حفظ الطلب"}</button>
        </form></details> : <p className="text-sm text-muted-foreground">تظهر هنا الطلبات الإدارية التي يسندها المشرف إلى حسابك.</p>}
        <div className="space-y-3"><h3 className="font-bold">الطلبات والمتابعة ({records.length})</h3>{records.length === 0 ? <p className="page-surface text-sm">لا توجد طلبات مسجلة في هذا القسم ضمن صلاحيتك.</p> : records.map((r) => <article key={r.id} className="page-surface space-y-3"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold">{r.subject}</h4><span className="text-xs bg-secondary rounded-full px-3 py-1">{operationStatuses[r.status]}</span></div><p className="text-sm leading-7 whitespace-pre-wrap">{r.details}</p><dl className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground"><div><dt className="inline">الفرع: </dt><dd className="inline">{branchName(r.branchId)}</dd></div><div><dt className="inline">المكلف: </dt><dd className="inline">{r.assignee}</dd></div>{r.serviceDate && <div>الوصول: {r.serviceDate} {r.requestedTime}</div>}{r.dueAt && <div>المتابعة: {stamp(r.dueAt)}</div>}{r.guestName && <div>الضيف: {r.guestName}</div>}{r.guestPhone && <div>التواصل: <a href={`tel:${r.guestPhone}`} dir="ltr">{r.guestPhone}</a></div>}</dl>{r.resolution && <p className="text-sm rounded-xl bg-secondary/40 p-3">النتيجة: {r.resolution}</p>}
          {(data.canManage || r.assignee === data.username) && <details><summary className="text-sm cursor-pointer text-primary">تحديث المتابعة</summary><form key={r.updatedAt} className="grid gap-3 mt-3" onSubmit={(event) => void submit(event, { id: r.id }, "PATCH")}><label className="text-sm">حالة الطلب<select name="status" defaultValue={r.status} className={fieldClass}>{Object.entries(operationStatuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>{data.canManage && <Field name="assignee" label="الحساب المكلف" defaultValue={r.assignee} maxLength={120} />}<label className="text-sm">الإجراء والنتيجة<textarea name="resolution" maxLength={1500} defaultValue={r.resolution} rows={2} className="w-full mt-2 border rounded-xl p-3" /></label><button disabled={busy} className="rounded-xl border h-11 text-sm disabled:opacity-50">حفظ التحديث</button></form></details>}
        </article>)}</div>
      </>}
    </>}
  </div>;
}
