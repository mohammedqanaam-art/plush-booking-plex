import { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, Search } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { publicQuestions, publicServiceGuides, type PublicGuideId } from "@/data/publicServiceGuides";

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F\u0670ـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").trim();

export default function PublicHelp({ topic }: { topic?: PublicGuideId }) {
  const [query, setQuery] = useState("");
  const guide = publicServiceGuides.find(item => item.id === topic);
  const questions = useMemo(() => publicQuestions.filter(item => normalize(`${item.question} ${item.answer}`).includes(normalize(query))), [query]);

  return <div className="page-wrap" dir="rtl">
    <PageHeader title={guide?.title || "مركز المساعدة"} icon={BookOpen} actions={guide ? <Link to="/help" className="text-sm text-primary underline">جميع الإرشادات</Link> : undefined} />
    <p className="text-sm leading-7 text-muted-foreground">إرشادات عامة متاحة دون تسجيل دخول. تُراجع شروط الحجز والسياسات المعتمدة وتأكيد الفندق قبل تنفيذ الطلب.</p>
    <nav aria-label="الإرشادات العامة" className="flex flex-wrap gap-2">
      {publicServiceGuides.map(item => <Link key={item.id} to={item.path} aria-current={guide?.id === item.id ? "page" : undefined} className={`rounded-xl border px-4 py-3 text-sm ${guide?.id === item.id ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>{item.title}</Link>)}
    </nav>

    {guide ? <>
      <p className="leading-7">{guide.description}</p>
      <ol className="space-y-3" aria-label="خطوات الإجراء">
        {guide.steps.map((step, index) => <li key={step.title} className="page-surface flex items-start gap-4">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary">{(index + 1).toLocaleString("ar-SA")}</span>
          <div><h2 className="font-bold">{step.title}</h2><p className="mt-2 text-sm leading-8 text-muted-foreground">{step.text}</p></div>
        </li>)}
      </ol>
      <Link to={guide.action.to} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">{guide.action.label}<ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link>
    </> : <>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="دليل الفندق والتواصل">
        {[{ to: "/branches/information", title: "معلومات الفنادق", text: "اختر الفرع لعرض الغرف والمرافق والوجبات." }, { to: "/branches/phones", title: "أرقام الفنادق", text: "جميع أرقام الاستقبال مصنفة حسب البراند." }, { to: "/complaints", title: "تسجيل شكوى", text: "ارفع الملاحظة عبر النموذج واحفظ رقم الطلب." }, { to: "/contact-requests", title: "طلب تواصل", text: "حدد الفرع وسبب التواصل لتوجيه الطلب." }].map(item => <Link to={item.to} key={item.to} className="page-surface transition hover:shadow-md"><h2 className="font-bold text-primary">{item.title}</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">{item.text}</p></Link>)}
      </section>
      <section className="page-surface space-y-4" aria-labelledby="public-faq-title">
        <h2 id="public-faq-title" className="text-xl font-bold">الأسئلة الشائعة</h2>
        <label className="flex items-center gap-3 rounded-xl border px-3"><Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" /><span className="sr-only">البحث في الأسئلة الشائعة</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن إلغاء، غرف، دخول مبكر…" className="h-12 min-w-0 flex-1 bg-transparent outline-none" /></label>
        {questions.length ? questions.map(item => <details key={item.question} className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold leading-7">{item.question}</summary><p className="mt-3 text-sm leading-8 text-muted-foreground">{item.answer}</p><Link to={item.to} className="mt-3 inline-block text-sm text-primary underline">{item.label}</Link></details>) : <p role="status" className="text-sm">لا توجد نتيجة مطابقة. جرّب كلمة أخرى أو افتح أحد الإرشادات أعلاه.</p>}
      </section>
    </>}
  </div>;
}
