import { useMemo, useState } from "react";
import { Building2, ExternalLink, LockKeyhole, MapPin, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { publicBranches } from "@/data/publicBranches";
import PageHeader from "@/components/PageHeader";

export default function Branches() {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("الكل");
  const brands = useMemo(() => ["الكل", ...new Set(publicBranches.map((item) => item.brand))], []);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return publicBranches.filter((item) => (brand === "الكل" || item.brand === brand)
      && (!q || `${item.name} ${item.city}`.toLowerCase().includes(q)));
  }, [brand, query]);

  return <div className="page-wrap">
    <PageHeader title="دليل الفروع" icon={Building2} />
    <section className="page-surface space-y-4">
      <p className="text-sm text-muted-foreground">دليل تعريفي للفروع. تحقّق من الموقع الرسمي من العنوان والتوافر والأسعار قبل تأكيد الحجز.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="relative md:col-span-2">
          <span className="sr-only">البحث في دليل الفروع</span>
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم الفرع أو المدينة…"
            className="h-11 w-full rounded-xl border bg-secondary/50 px-10" />
        </label>
        <label>
          <span className="sr-only">العلامة الفندقية</span>
          <select className="h-11 w-full rounded-xl border bg-secondary/50 px-3" value={brand} onChange={(event) => setBrand(event.target.value)}>
            {brands.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <a href="https://boudl.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-primary underline">
          الموقع الرسمي لمجموعة بودل <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        <Link to="/knowledge-bank" className="inline-flex items-center gap-2 text-muted-foreground">
          <LockKeyhole className="h-4 w-4" aria-hidden="true" /> المعلومات التشغيلية للموظفين
        </Link>
      </div>
    </section>
    <p className="text-xs text-muted-foreground" role="status">{matches.length.toLocaleString("ar-SA")} نتيجة</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {matches.map((item) => <article className="page-surface space-y-2" key={item.id}>
        <span className="text-xs text-primary">{item.brand}</span>
        <h2 className="text-base font-semibold">{item.name}</h2>
        <p className="inline-flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden="true" />{item.city}</p>
      </article>)}
      {!matches.length && <p className="page-surface col-span-full text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة. جرّب اسمًا أقصر أو غيّر العلامة.</p>}
    </div>
  </div>;
}
