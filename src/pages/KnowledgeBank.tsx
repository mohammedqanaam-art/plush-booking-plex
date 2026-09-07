import { Link, useSearchParams } from "react-router-dom";
import { matchesKnowledgeQuery } from "@/lib/knowledgeTypes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Check, Copy, ExternalLink, Filter, Search, Tags } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import InternalKnowledgeBoundary from "@/components/InternalKnowledgeBoundary";
import { useInternalKnowledge } from "@/hooks/useInternalKnowledge";
import { knowledgeQuickIntents as quickIntents } from "@/lib/internalKnowledge";
import PageHeader from "@/components/PageHeader";

type ResultCategory = "البروتوكول" | "فروع" | "جهات اتصال" | "وجبات" | "غرف" | "مرافق" | "قاعات";
const categories: ResultCategory[] = ["البروتوكول", "فروع", "جهات اتصال", "وجبات", "غرف", "مرافق", "قاعات"];
type SearchResult = {
  id: string;
  kind: ResultCategory;
  title: string;
  summary: string;
  details: string;
  tags: string[];
  branch?: string;
  brand?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  verificationUrl?: string;
  response?: string;
  caution?: string;
  draft?: boolean;
  rooms?: Array<{ type: string; area: string; description: string }>;
};

const unavailableValues = new Set(["", "غير متوفر", "غير محدد", "يرجى التحقق من الفرع"]);
const isAvailable = (value: string) => !unavailableValues.has(value.trim());
const detailLines = (items: Array<[string, string]>) => items
  .filter(([, value]) => isAvailable(value))
  .map(([label, value]) => `${label}: ${value}`);

const KnowledgeBank = () => {
  const { branchRecords, protocols = [], sync, refresh } = useInternalKnowledge();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [limit, setLimit] = useState(24);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [brand, setBrand] = useState<"الكل" | "Braira" | "Boudl" | "Aber" | "Narcissus" | "Z'MN">("الكل");
  const [branch, setBranch] = useState("الكل");
  const [category, setCategory] = useState<"الكل" | ResultCategory>("الكل");
  const [selected, setSelected] = useState<SearchResult | null>(null);

  useEffect(() => { setLimit(24); }, [query, brand, branch, category]);
  useEffect(() => { setCopied(false); setCopyError(false); }, [selected]);

  const branchOptions = useMemo(() => {
    if (brand === "الكل") return ["الكل", ...branchRecords.map((b) => b.branch)];
    return ["الكل", ...branchRecords.filter((b) => b.brand === brand).map((b) => b.branch)];
  }, [brand, branchRecords]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const branchRows: SearchResult[] = branchRecords.flatMap((row) => {
      const contacts = detailLines([
        ["الاستقبال", row.receptionPhone],
        ["الفندق", row.hotelPhone],
        ["المبيعات", row.salesPhone],
        ["القاعات", row.hallPhone],
        ["واتساب", row.whatsappNumber],
      ]);
      const meals = detailLines([
        ["الإفطار", row.breakfastInfo],
        ["الغداء", row.lunchInfo],
        ["العشاء", row.dinnerInfo],
      ]);
      const facilities = detailLines([
        ["المسبح", row.poolInfo],
        ["المطعم", row.restaurantInfo],
        ["المقهى", row.coffeeShopInfo],
        ["المواقف", row.parkingInfo],
        ["السبا", row.spaInfo],
        ["النادي", row.gymInfo],
      ]);
      const halls = row.hallPackages.filter(isAvailable);
      const sheetSource = row.sourceFiles.find((source) => source.startsWith("http"));
      const rows: Array<SearchResult | null> = [
        {
          id: `${row.id}-overview`,
          kind: "فروع",
          title: row.branch,
          summary: `${row.city} · ${row.region}`,
          details: `${row.overview}\n${row.notes}`,
          tags: [row.brand, row.city],
          brand: row.brand,
          branch: row.branch,
          sourceLabel: sheetSource ? "شيت معلومات الفروع" : "ملف الفروع الداخلي",
          sourceUrl: sheetSource,
        },
        contacts.length ? {
          id: `${row.id}-contacts`, kind: "جهات اتصال", title: `تواصل ${row.branch}`, summary: contacts[0], details: contacts.join("\n"), tags: [row.brand, "تواصل"], brand: row.brand, branch: row.branch,
          sourceLabel: "شيت معلومات الفروع", sourceUrl: sheetSource,
        } : null,
        meals.length ? {
          id: `${row.id}-meals`, kind: "وجبات", title: `وجبات ${row.branch}`, summary: meals[0], details: meals.join("\n"), tags: [row.brand, "وجبات"], brand: row.brand, branch: row.branch,
          sourceLabel: "شيت معلومات الفروع", sourceUrl: sheetSource,
        } : null,
        facilities.length ? {
          id: `${row.id}-facilities`, kind: "مرافق", title: `مرافق ${row.branch}`, summary: facilities[0], details: facilities.join("\n"), tags: [row.brand, "مرافق"], brand: row.brand, branch: row.branch,
          sourceLabel: "شيت معلومات الفروع", sourceUrl: sheetSource,
        } : null,
        row.roomTypes.length ? {
          id: `${row.id}-rooms`, kind: "غرف", title: `غرف ${row.branch}`, summary: row.roomTypes.slice(0, 2).join("، "),
          details: `${row.roomTypes.map((room) => `• ${room}`).join("\n")}\n\nتحتاج هذه القائمة إلى مطابقة نهائية مع نظام الفندق قبل تأكيدها للضيف.`,
          rooms: row.roomDetails, tags: [row.brand, "غرف", "تحتاج تحقق"], brand: row.brand, branch: row.branch,
          sourceLabel: "ملف الغرف الداخلي — يحتاج تحقق", verificationUrl: "https://www.boudl.com/",
        } : null,
        halls.length ? {
          id: `${row.id}-halls`, kind: "قاعات", title: `قاعات ${row.branch}`, summary: halls[0], details: halls.map((hall) => `• ${hall}`).join("\n"), tags: [row.brand, "قاعات"], brand: row.brand, branch: row.branch,
          sourceLabel: "شيت معلومات الفروع", sourceUrl: sheetSource,
        } : null,
      ];
      return rows.filter((item): item is SearchResult => Boolean(item));
    });

    const protocolRows: SearchResult[] = protocols.map((entry) => ({
      id: entry.id, kind: "البروتوكول", title: entry.title, summary: entry.response,
      details: entry.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      response: entry.response, caution: entry.caution, draft: entry.status === "draft",
      tags: [entry.category, ...entry.keywords], sourceLabel: entry.sourceTitle, sourceUrl: entry.sourceUrl,
    }));
    return [...protocolRows, ...branchRows].filter((row) => {
      const matchBrand = brand === "الكل" || row.brand === brand || row.kind === "البروتوكول";
      const matchBranch = branch === "الكل" || row.branch === branch || row.kind === "البروتوكول";
      const matchCategory = category === "الكل" || row.kind === category;
      const blob = `${row.title} ${row.summary} ${row.details} ${row.tags.join(" ")}`.toLowerCase();
      const matchQuery = !q || matchesKnowledgeQuery(blob, q);
      return matchBrand && matchBranch && matchCategory && matchQuery;
    });
  }, [query, brand, branch, category, branchRecords, protocols]);

  const hasCriteria = query.trim().length > 0 || brand !== "الكل" || branch !== "الكل" || category !== "الكل";
  const visibleResults = results.slice(0, limit);

  return (
    <div className="page-wrap">
      <PageHeader title="بنك المعلومات" icon={BookOpenCheck} actions={<Link to="/assistant" className="text-sm font-semibold text-primary">اسأل المساعد</Link>} />
      {sync ? <details className="rounded-xl border bg-background p-4 text-sm leading-7">
        <summary className="cursor-pointer font-semibold">{sync.message}</summary>
        {refresh ? <button type="button" className="my-2 rounded-lg border px-4 py-2 text-sm" onClick={refresh}>تحديث المعلومات</button> : null}
        <p className="mt-2 text-muted-foreground">تاريخ النسخة المحفوظة: {sync.snapshotDate} · اتصال الشيت لا يثبت التوفر الفعلي للغرف.</p>
        <ul className="mt-2 space-y-1">{sync.tabs.map((tab) => <li key={tab.title}><a href={tab.url} target="_blank" rel="noreferrer" className="text-primary underline">{tab.title}</a> — {tab.available ? `آخر قراءة: ${new Date(tab.fetchedAt!).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}` : "نسخة محفوظة — يحتاج التحقق"}</li>)}</ul>
      </details> : null}

      <section className="page-surface space-y-3">
        {hasCriteria ? <div className="flex justify-end"><span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm text-primary">{results.length} نتيجة</span></div> : null}
        <div className="grid md:grid-cols-4 gap-2">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="h-11 rounded-xl bg-secondary/70 border px-10 w-full" aria-label="البحث في بنك المعلومات" placeholder="مثال: شكوى، إلغاء، إفطار، بودل العليا…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select aria-label="العلامة التجارية" className="h-11 rounded-xl bg-secondary/70 border px-3" value={brand} onChange={(e) => { setBrand(e.target.value as typeof brand); setBranch("الكل"); }}>
            <option value="الكل">كل العلامات</option><option value="Braira">Braira</option><option value="Boudl">Boudl</option><option value="Aber">Aber</option><option value="Narcissus">Narcissus</option><option value="Z'MN">Z'MN</option>
          </select>
          <select aria-label="الفرع" className="h-11 rounded-xl bg-secondary/70 border px-3" value={branch} onChange={(e) => setBranch(e.target.value)}>{branchOptions.map((b) => <option key={b}>{b}</option>)}</select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Filter className="w-3.5 h-3.5" /> تصنيفات سريعة</span>
          <button onClick={() => setCategory("الكل")} className={`text-sm px-3 py-1.5 rounded-full border interactive ${category === "الكل" ? "border-primary text-primary bg-primary/10" : "hover:border-primary/60"}`}>الكل</button>
          {categories.map((item) => (
            <button key={item} onClick={() => setCategory(item)} className={`text-sm px-3 py-1.5 rounded-full border interactive ${category === item ? "border-primary text-primary bg-primary/10" : "hover:border-primary/60"}`}>
              {item}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Tags className="w-3.5 h-3.5" /> بحث سريع</span>
          {quickIntents.map((intent) => (
            <button key={intent} onClick={() => setQuery(intent)} className="text-sm px-3 py-1.5 rounded-full border border-primary/18 bg-secondary/24 hover:border-primary/50 interactive">
              {intent}
            </button>
          ))}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-3">
        {visibleResults.length ? visibleResults.map((item) => (
          <button key={item.id} className="page-surface min-h-[126px] text-right card-hover" onClick={() => setSelected(item)}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm px-2 py-1 rounded-full border border-primary/30 text-primary bg-primary/10">{item.kind}</span>
            </div>
            <h3 className="font-semibold leading-6 text-sm md:text-base">{item.title}</h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
          </button>
        )) : <div className="md:col-span-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد نتيجة مطابقة. جرّب كلمة أقصر أو غيّر الفلاتر.</div>}
      </div>

      {results.length > visibleResults.length ? <div className="text-center"><button type="button" className="rounded-xl border px-6 py-3 text-sm font-semibold" onClick={() => setLimit((value) => value + 24)}>عرض المزيد ({visibleResults.length} من {results.length})</button></div> : null}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl glass-card border-primary/20">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{selected.brand ?? "مرجع عام"} · {selected.branch ?? "سياسة عامة"}</p>
              {selected.draft ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">صياغة إرشادية من مسودة 3.0؛ التنفيذ وفق آخر تعميم معتمد.</p> : null}
              <div className="max-h-[55vh] space-y-4 overflow-auto custom-scrollbar">
                {selected.response ? <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><h3 className="mb-2 text-sm font-bold">الرد المقترح للضيف</h3><p className="text-base leading-8">{selected.response}</p></section> : null}
                <div className="rounded-xl border border-primary/20 bg-secondary/24 p-4 whitespace-pre-line text-base leading-8">{selected.details}</div>
                {selected.rooms?.length ? <Table><TableHeader><TableRow><TableHead>نوع الغرفة</TableHead><TableHead>المساحة</TableHead><TableHead>الوصف</TableHead></TableRow></TableHeader><TableBody>{selected.rooms.map((room, i) => <TableRow key={i}><TableCell dir="auto">{room.type}</TableCell><TableCell className="whitespace-nowrap">{room.area || "غير محددة"}</TableCell><TableCell className="min-w-40 leading-7">{room.description}</TableCell></TableRow>)}</TableBody></Table> : null}
                {selected.caution ? <p className="text-sm font-semibold leading-7">حدود الإجراء: {selected.caution}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2"><button className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm" onClick={async () => { try { await navigator.clipboard.writeText(selected.response || selected.details); setCopied(true); setCopyError(false); } catch { setCopied(false); setCopyError(true); } }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "تم النسخ" : selected.response ? "نسخ الرد" : "نسخ المعلومات"}</button><Link className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground" to={`/assistant?q=${encodeURIComponent(selected.title)}`}>استفسر من المساعد</Link></div>
              {copyError ? <p role="status" className="text-sm text-destructive">تعذر النسخ تلقائيًا؛ يمكنك تحديد النص ونسخه يدويًا.</p> : null}
              {selected.sourceLabel ? selected.sourceUrl ? (
                <a className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline" href={selected.sourceUrl} target="_blank" rel="noreferrer">
                  {selected.sourceLabel} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : <p className="text-sm text-muted-foreground">المصدر: {selected.sourceLabel}</p> : null}
              {selected.verificationUrl ? (
                <a className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline" href={selected.verificationUrl} target="_blank" rel="noreferrer">
                  التحقق من موقع بودل <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {selected.tags.map((tag) => <span key={tag} className="text-sm px-2 py-1 rounded-full bg-secondary/70 border border-primary/18">{tag}</span>)}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default function ProtectedKnowledgeBank() {
  return <InternalKnowledgeBoundary><KnowledgeBank /></InternalKnowledgeBoundary>;
}

