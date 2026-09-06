import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, Check, Copy, ExternalLink, MapPin, PhoneCall, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { publicBranches } from "@/data/publicBranches";
import { publicBranchContacts } from "@/data/publicBranchContacts";
import PageHeader from "@/components/PageHeader";

const brands = [...new Set(publicBranches.map((item) => item.brand))];
const tones = ["border-emerald-700/20 bg-emerald-50/70", "border-violet-700/20 bg-violet-50/70", "border-amber-700/20 bg-amber-50/70", "border-sky-700/20 bg-sky-50/70", "border-rose-700/20 bg-rose-50/70"];
const normalize = (text: string) => text.trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه");

export default function Branches() {
  const [params, setParams] = useSearchParams();
  const brand = params.get("brand") || "";
  const branchId = params.get("branch") || "";
  const query = params.get("q") || "";
  const branch = publicBranches.find((item) => item.id === branchId && (!brand || item.brand === brand));
  const contact = branch ? publicBranchContacts[branch.id] : undefined;
  const matches = publicBranches.filter((item) => (!brand || item.brand === brand)
    && normalize(item.name + " " + item.city + " " + item.brand).includes(normalize(query)));
  const [copyStatus, setCopyStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setCopyStatus(""); heading.current?.focus(); }, [brand, branchId]);

  const href = (nextBrand = "", nextBranch = "") => {
    const next = new URLSearchParams();
    if (nextBrand) next.set("brand", nextBrand);
    if (nextBranch) next.set("branch", nextBranch);
    if (query) next.set("q", query);
    return "/branches" + (next.size ? "?" + next : "");
  };
  const back = () => {
    const next = new URLSearchParams(params);
    if (branchId) next.delete("branch"); else next.delete("brand");
    setParams(next);
  };
  const copyPhone = async () => {
    if (!contact?.phone) return;
    try { await navigator.clipboard.writeText(contact.phone); setCopyStatus("تم نسخ الرقم"); }
    catch { setCopyStatus("تعذر النسخ تلقائيًا؛ اضغط مطولًا على الرقم لنسخه."); }
  };

  return <div className="page-wrap">
    <PageHeader title="دليل الفروع وأرقام الاستقبال" icon={PhoneCall} onBack={brand || branchId ? back : undefined} />
    <nav aria-label="مسار دليل الفروع" className="flex flex-wrap items-center gap-2 text-sm">
      <Link to={href()} className="rounded-lg px-3 py-2 text-primary hover:bg-secondary">البراندات</Link>
      {(brand || branch) && <><span aria-hidden="true">/</span><Link to={href(brand || branch?.brand)} className="rounded-lg px-3 py-2 text-primary hover:bg-secondary">{brand || branch?.brand}</Link></>}
      {branch && <><span aria-hidden="true">/</span><span aria-current="page" className="px-3 py-2">{branch.name}</span></>}
    </nav>
    {!branchId && <label className="relative block">
      <span className="sr-only">البحث في دليل الفروع</span>
      <Search className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <input value={query} onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value) next.set("q", event.target.value); else next.delete("q"); setParams(next, { replace: true }); }}
        placeholder="اسم الفرع أو المدينة…" className="h-12 w-full rounded-xl border bg-background px-10" />
    </label>}
    <h2 ref={heading} tabIndex={-1} className="text-lg font-bold outline-none">{branch?.name || (branchId ? "الفرع غير موجود" : brand ? "فروع " + brand : "اختر البراند")}</h2>
    {!brand && !branchId && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {brands.map((name, index) => <Link key={name} to={href(name)} className={"rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md " + tones[index % tones.length]}>
        <Building2 className="mb-4 h-7 w-7 text-primary" aria-hidden="true" />
        <strong className="block text-lg text-foreground">{name}</strong>
        <span className="mt-2 block text-xs text-muted-foreground">{publicBranches.filter((item) => item.brand === name).length.toLocaleString("ar-SA")} فرعًا</span>
      </Link>)}
    </div>}
    {branch ? <section className="page-surface space-y-5" aria-label="تفاصيل الفرع">
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span>{branch.brand}</span><span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden="true" />{branch.city}</span></div>
      <div className="rounded-2xl border border-primary/15 bg-secondary/40 p-5">
        <h3 className="mb-3 text-sm font-semibold">رقم الاستقبال</h3>
        {contact?.phone ? <>
          <a href={"tel:" + contact.phone} dir="ltr" className="block w-fit select-all text-2xl font-bold tracking-wide text-primary">{contact.phone}</a>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={"tel:" + contact.phone} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"><PhoneCall className="h-4 w-4" />اتصال بالاستقبال</a>
            <button onClick={() => void copyPhone()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-5 py-3 text-sm">{copyStatus === "تم نسخ الرقم" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}نسخ الرقم</button>
          </div>
          <p role="status" className="mt-2 text-xs text-muted-foreground">{copyStatus}</p>
          {contact.note && <p className="mt-3 text-xs leading-6 text-amber-800">{contact.note}</p>}
          {contact.sourceUrl && <a href={contact.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline">مصدر الرقم الرسمي<ExternalLink className="h-3 w-3" /></a>}
        </> : <p className="text-sm text-muted-foreground">لم يُسجّل رقم استقبال لهذا الفرع بعد.</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to={href(branch.brand)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm">العودة إلى الفروع<ArrowLeft className="h-4 w-4" /></Link>
        <Link to={href()} className="inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm">جميع البراندات</Link>
      </div>
    </section> : branchId ? <div className="page-surface space-y-3"><p>تعذر العثور على الفرع المطلوب.</p><Link to={href(brand)} className="text-primary underline">العودة إلى الفروع</Link></div> : (brand || query) && <>
      <p role="status" className="text-xs text-muted-foreground">{matches.length.toLocaleString("ar-SA")} فرعًا</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((item) => <Link key={item.id} to={href(item.brand, item.id)} className="page-surface group flex min-h-28 items-center justify-between gap-3 transition hover:border-primary/40 hover:shadow-md">
          <div><span className="text-xs text-primary">{item.brand}</span><h3 className="mt-1 text-base font-semibold">{item.name}</h3><p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden="true" />{item.city}</p></div>
          <ArrowLeft className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        </Link>)}
      </div>
      {!matches.length && <p className="page-surface text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة. جرّب اسمًا أقصر أو ارجع إلى البراندات.</p>}
    </>}
    <p className="text-xs leading-6 text-muted-foreground">أرقام الاستقبال حسب دليل الفروع المسجل. التفاصيل التشغيلية والأسعار تُراجع مع الفرع قبل تأكيد الحجز.</p>
  </div>;
}
