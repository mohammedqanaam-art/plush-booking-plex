import { useState } from "react";
import { CircleCheck, UserRoundPlus } from "lucide-react";
import { workplaceRequest } from "@/lib/workplaceApi";

export default function RegistrationForm({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [sent, setSent] = useState(false);
  if (sent) return <section className="glass-card p-8 text-center space-y-4" role="status">
    <CircleCheck className="h-14 w-14 mx-auto text-primary" />
    <h2 className="text-xl font-bold">تم رفع طلبكم لمدير النظام</h2>
    <p>سيتم المراجعة وتفعيل حسابكم.</p>
    <p className="text-sm text-muted-foreground">بعد موافقة المدير، ادخل بالبريد الإلكتروني وكلمة المرور التي اخترتها.</p>
    <button className="h-11 px-5 rounded-xl border" onClick={onBack}>العودة لتسجيل الدخول</button>
  </section>;
  return <section className="glass-card p-6 sm:p-8 space-y-5">
    <div className="flex items-center gap-3"><UserRoundPlus className="text-primary" /><div><h2 className="text-xl font-bold">طلب حساب موظف</h2><p className="text-sm text-muted-foreground">يراجع مدير النظام طلبك ويحدد صلاحياتك قبل التفعيل.</p></div></div>
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError("");
      try { await workplaceRequest("/api/account-requests", fields); setSent(true); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <div className="grid sm:grid-cols-2 gap-4">
        {[{ name: "firstName", label: "الاسم الأول", type: "text", autoComplete: "given-name" }, { name: "lastName", label: "اسم العائلة", type: "text", autoComplete: "family-name" }, { name: "email", label: "البريد الإلكتروني", type: "email", autoComplete: "email" }, { name: "phone", label: "رقم الجوال", type: "tel", autoComplete: "tel" }].map((field) => <label key={field.name} className="block text-sm space-y-2"><span>{field.label}</span><input {...field} required maxLength={field.type === "text" ? 60 : 120} dir={field.type === "text" ? "auto" : "ltr"} className="w-full rounded-xl border bg-secondary/50 h-11 px-3" /></label>)}
      </div>
      <label className="block text-sm space-y-2"><span>كلمة المرور (12 حرفًا على الأقل)</span><input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" dir="ltr" className="w-full rounded-xl border bg-secondary/50 h-11 px-3" /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button disabled={busy} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">{busy ? "جاري رفع الطلب…" : "رفع طلب التسجيل"}</button>
      <button type="button" onClick={onBack} className="w-full h-11 text-sm">لدي حساب — تسجيل الدخول</button>
    </form>
  </section>;
}
