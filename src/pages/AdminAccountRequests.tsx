import { useEffect, useState } from "react";
import { CircleCheck, Clock3, Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getAdminSession } from "@/lib/adminAuth";
import { workplaceRequest } from "@/lib/workplaceApi";

type Account = { id: string; email: string; firstName: string; lastName: string; phone: string; status: "pending" | "approved" | "rejected" | "disabled"; createdAt: string; reviewedBy?: string; role?: string };
const statuses = { pending: "بانتظار المراجعة", approved: "مفعّل", rejected: "لم يعتمد", disabled: "معطّل" };
export default function AdminAccountRequests() {
  const [records, setRecords] = useState<Account[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true), [roles, setRoles] = useState<Record<string, string>>({});
  const allowed = getAdminSession()?.role === "superadmin";
  const load = async () => { setError(""); try { setRecords((await workplaceRequest<{ requests: Account[] }>("/api/account-requests")).requests); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } };
  useEffect(() => { if (allowed) void load(); else setLoading(false); }, [allowed]);
  const decide = async (id: string, action: "approve" | "reject" | "deactivate" | "activate") => {
    setBusy(id); setError("");
    try { const result = await workplaceRequest<{ request: Account }>("/api/account-requests", { id, action, role: roles[id] || records.find((r) => r.id === id)?.role || "viewer" }, "PATCH"); setRecords((rows) => rows.map((r) => r.id === id ? result.request : r)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  return <div className="page-wrap space-y-5"><PageHeader title="طلبات تسجيل الحسابات" icon={Users} />
    {!allowed ? <p role="alert" className="page-surface">هذه الصفحة مخصصة لمدير النظام.</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 page-surface"><div className="flex gap-3 items-center"><Clock3 className="text-primary" /><span><strong>{records.filter((r) => r.status === "pending").length}</strong> طلبات بانتظار المراجعة</span></div><button className="rounded-xl border px-4 py-2" onClick={() => void load()}>تحديث</button></div>
      <p className="text-sm text-muted-foreground">راجع هوية الموظف وبيانات التواصل قبل التفعيل. صلاحية الموظف هي الافتراضية؛ اختر صلاحية إشرافية عند الحاجة.</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {loading ? <p>جاري تحميل الطلبات…</p> : records.length === 0 ? <p className="page-surface">لا توجد طلبات تسجيل حتى الآن.</p> : <div className="grid lg:grid-cols-2 gap-4">{records.map((record) => <section key={record.id} className="page-surface space-y-4">
        <div className="flex justify-between gap-3"><h2 className="font-bold">{record.firstName} {record.lastName}</h2><span className="text-xs rounded-full bg-secondary px-3 py-1">{statuses[record.status]}</span></div>
        <dl className="text-sm space-y-2"><div><dt className="text-muted-foreground">البريد الإلكتروني</dt><dd dir="ltr" className="text-right break-all">{record.email}</dd></div><div><dt className="text-muted-foreground">الجوال</dt><dd dir="ltr" className="text-right">{record.phone}</dd></div><div><dt className="text-muted-foreground">تاريخ الطلب</dt><dd>{new Date(record.createdAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</dd></div></dl>
        {record.status === "pending" ? <div className="space-y-3"><label className="text-sm block">صلاحية الحساب<select aria-label={`صلاحية ${record.email}`} value={roles[record.id] || "viewer"} onChange={(e) => setRoles({ ...roles, [record.id]: e.target.value })} className="w-full mt-2 h-11 border rounded-xl px-3"><option value="viewer">موظف حجز</option><option value="editor">محرر بيانات</option><option value="admin">مشرف</option></select></label><div className="flex gap-2"><button disabled={!!busy} onClick={() => void decide(record.id, "approve")} className="flex-1 rounded-xl bg-primary text-primary-foreground h-11 flex items-center justify-center gap-2 disabled:opacity-50"><CircleCheck className="w-4" />تفعيل الحساب</button><button disabled={!!busy} onClick={() => void decide(record.id, "reject")} className="rounded-xl border px-5 h-11 disabled:opacity-50">عدم الاعتماد</button></div></div> : <p className="text-xs text-muted-foreground">تمت المراجعة بواسطة {record.reviewedBy}</p>}
        {record.status === "approved" && <button disabled={!!busy} className="rounded-xl border border-destructive/30 text-destructive px-4 h-11 disabled:opacity-50" onClick={() => void decide(record.id, "deactivate")}>تعطيل الحساب وإيقاف جلساته</button>}
        {record.status === "disabled" && <button disabled={!!busy} className="rounded-xl border px-4 h-11 disabled:opacity-50" onClick={() => void decide(record.id, "activate")}>إعادة تفعيل الحساب</button>}
      </section>)}</div>}
    </>}
  </div>;
}
