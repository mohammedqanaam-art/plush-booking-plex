import { Link, useSearchParams } from "react-router-dom";
import { Building2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import PublicHotelBoundary from "@/components/PublicHotelBoundary";
import InternalKnowledgeBoundary from "@/components/InternalKnowledgeBoundary";
import { useInternalKnowledge } from "@/hooks/useInternalKnowledge";
import { normalizeKnowledgeText } from "@/lib/knowledgeTypes";
import type { BranchRecord } from "@/data/knowledge";
import { hotelFactLabels, type HotelFactKey, type HotelWorkbookDetails } from "@/lib/hotelWorkbook";

const brandNames: Record<string, string> = { Braira: "بريرا", Boudl: "بودل", Aber: "عابر", Narcissus: "نارسيس", "Z'MN": "زمن" };
const groups: Array<{ title: string; fields: Array<[keyof BranchRecord, string]> }> = [
  { title: "عن الفندق", fields: [["city", "المدينة"], ["region", "المنطقة"], ["overview", "نبذة عن الفرع"]] },
  { title: "التواصل", fields: [["receptionPhone", "الاستقبال"], ["hotelPhone", "الفندق"], ["salesPhone", "المبيعات"], ["hallPhone", "القاعات"], ["whatsappNumber", "واتساب"], ["managerName", "مدير الفرع"], ["managerPhone", "هاتف المدير"], ["managerEmail", "بريد المدير"]] },
  { title: "الوجبات والمطاعم", fields: [["breakfastInfo", "الإفطار"], ["lunchInfo", "الغداء"], ["dinnerInfo", "العشاء"], ["restaurantInfo", "المطعم"], ["restaurantHours", "أوقات المطعم"], ["coffeeShopInfo", "المقهى"]] },
  { title: "المرافق والخدمات", fields: [["poolInfo", "المسبح"], ["poolHours", "أوقات المسبح"], ["gymInfo", "النادي الرياضي"], ["gymHours", "أوقات النادي"], ["spaInfo", "السبا"], ["spaHours", "أوقات السبا"], ["jacuzziInfo", "الجاكوزي"], ["bathtubInfo", "البانيو"], ["balconyInfo", "الإطلالات والشرفات"], ["parkingInfo", "المواقف"], ["kidsSectionInfo", "قسم الأطفال"], ["laundryInfo", "الغسيل"], ["outdoorSeatingInfo", "الجلسات الخارجية"]] },
];
const safeUrl = (value: string) => /^https?:\/\//i.test(value) ? value : undefined;
const text = (value: unknown) => typeof value === "string" && value.trim() && !["-", "--", "*"].includes(value.trim()) ? value : "غير مسجل في المصدر";

function WorkbookFacts({ details, fields }: { details: HotelWorkbookDetails; fields: HotelFactKey[] }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{fields.map(field => <div key={field} className="min-w-0 rounded-xl border bg-secondary/20 p-4"><dt className="mb-2 text-sm text-muted-foreground">{hotelFactLabels[field]}</dt><dd dir="auto" className="whitespace-pre-wrap break-words leading-7">{text(details.facts[field])}</dd></div>)}</dl>;
}
const extraGroupFields: Record<string, HotelFactKey[]> = {
  "عن الفندق": ["englishName", "openingYear", "stars", "address"],
  "الوجبات والمطاعم": ["breakfastHours", "restaurantType"],
  "المرافق والخدمات": ["view", "poolAudience", "airportTransfer"],
};

export function HotelInformationContent({ publicView = false }: { publicView?: boolean }) {
  const { branchRecords, branches, sync, refresh } = useInternalKnowledge();
  const [params, setParams] = useSearchParams();
  const brand = params.get("brand") || "";
  const id = params.get("branch") || "";
  const options = branchRecords.filter(row => !brand || row.brand === brand);
  const selected = options.find(row => row.id === id);
  const extraMatches = selected ? branches.filter(row => normalizeKnowledgeText(row.name) === normalizeKnowledgeText(selected.branch)) : [];
  const extra = extraMatches.length === 1 ? extraMatches[0] : undefined;
  return <div className="page-wrap" dir="rtl">
    <PageHeader title="معلومات الفنادق" icon={Building2} actions={<div className="flex flex-wrap gap-4"><Link to="/branches" className="text-sm text-primary underline">دليل الفروع</Link>{publicView && <Link to="/branches/internal-information" className="text-sm text-primary underline">تفاصيل الموظفين</Link>}</div>} />
    <div className="page-surface grid gap-4 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-semibold"><span>البراند</span><select value={brand} onChange={event => setParams(event.target.value ? { brand: event.target.value } : {})} className="h-12 w-full rounded-xl border bg-background px-3">
        <option value="">جميع البراندات</option>{[...new Set(branchRecords.map(row => row.brand))].map(name => <option key={name} value={name}>{brandNames[name] || name}</option>)}
      </select></label>
      <label className="space-y-2 text-sm font-semibold"><span>الفرع</span><select value={selected?.id || ""} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set("branch", event.target.value); else next.delete("branch"); setParams(next); }} className="h-12 w-full rounded-xl border bg-background px-3">
        <option value="">اختر الفرع</option>{options.map(row => <option key={row.id} value={row.id}>{row.branch} — {row.city}</option>)}
      </select></label>
    </div>
    {sync && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><div><p>{sync.message}</p><p className="mt-1 text-muted-foreground">حالة المصدر: {sync.state === "live" ? "مباشر" : sync.state === "partial" ? "تحديث جزئي" : "نسخة محفوظة"}{sync.checkedAt ? ` · آخر فحص: ${sync.checkedAt}` : ""}{sync.state !== "live" && sync.snapshotDate ? ` · تاريخ النسخة: ${sync.snapshotDate}` : ""}</p></div>{refresh && <button onClick={refresh} className="rounded-lg border px-4 py-2">تحديث المعلومات</button>}</div>}
    {!selected ? <p role="status" className="page-surface text-center">{id ? "الفرع المطلوب غير موجود ضمن البراند المحدد. اختر فرعًا من القائمة." : "اختر الفرع لعرض جميع تفاصيله المسجلة."}</p> : <>
      <div><h2 className="text-2xl font-bold">{selected.branch}</h2><p className="mt-2 text-sm text-muted-foreground">{brandNames[selected.brand] || selected.brand} · {selected.city}</p></div>
      {selected.workbook && <div className="rounded-xl border border-primary/20 bg-secondary/30 p-4 text-sm leading-7"><p>تم إثراء هذا الفرع من الشيت المرفوع · تاريخ الاستيراد: <span dir="ltr">{selected.workbook.importedOn}</span></p><p className="text-muted-foreground">الخانة غير المسجلة لا تعني عدم توفر الخدمة. المواعيد والرسوم والإتاحة تُؤكد مع الفرع قبل الحجز.</p></div>}
      {!!selected.workbook?.warnings.length && <aside aria-label="معلومات تحتاج تأكيدًا" className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><h3 className="font-bold">معلومات تحتاج تأكيدًا من الفرع</h3><ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7">{selected.workbook.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}
      {selected.workbook && <section className="page-surface space-y-4"><h3 className="text-lg font-bold text-primary">الإقامة والخدمات الإضافية</h3><WorkbookFacts details={selected.workbook} fields={["checkIn", "checkOut", "earlyCheckIn", "smokingRooms", "extraBed", "extraBedFee", "babyCot"]} /><p className="text-xs text-muted-foreground">الدخول والخروج بتوقيت الفندق المحلي، ويعرض وقت الدخول بصيغة 24 ساعة.</p></section>}
      {groups.map(group => <section key={group.title} className="page-surface space-y-4"><h3 className="text-lg font-bold text-primary">{group.title}</h3><dl className="grid gap-4 sm:grid-cols-2">{group.fields.filter(([field]) => !publicView || !["hotelPhone", "salesPhone", "hallPhone", "whatsappNumber", "managerName", "managerPhone", "managerEmail"].includes(field)).map(([field, label]) => <div key={field} className="min-w-0 rounded-xl border bg-secondary/20 p-4"><dt className="mb-2 text-sm text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words text-base leading-7" dir="auto">{text(selected[field])}</dd></div>)}</dl>
        {selected.workbook && extraGroupFields[group.title] && <WorkbookFacts details={selected.workbook} fields={extraGroupFields[group.title]} />}
        {group.title === "عن الفندق" && selected.workbook?.facts.address && <p className="text-sm text-muted-foreground">وصف الموقع والمعالم بحسب الشيت؛ المسافات وأوقات التنقل تقريبية وتختلف بحسب الطريق وحركة المرور.</p>}
        {group.title === "التواصل" && selected.workbook?.receptionPhones.some(phone => phone !== selected.receptionPhone) && <div className="space-y-2"><h4 className="text-sm font-semibold">أرقام إضافية واردة في الشيت</h4>{selected.workbook.receptionPhones.filter(phone => phone !== selected.receptionPhone).map(phone => <a key={phone} href={`tel:${phone}`} dir="ltr" className="block w-fit select-all py-2 text-primary underline">{phone}</a>)}</div>}
      </section>)}
      <section className="page-surface space-y-4"><h3 className="text-lg font-bold text-primary">الغرف والأجنحة</h3>
        {selected.roomDetails?.length ? <div className="grid gap-3 sm:grid-cols-2">{selected.roomDetails.map((room, index) => <article key={`${room.type}-${index}`} className="rounded-xl border p-4"><h4 className="font-semibold" dir="auto">{room.type}</h4><p className="mt-2">المساحة: {text(room.area)}</p><p className="mt-2 whitespace-pre-wrap leading-7">{text(room.description)}</p></article>)}</div> : null}
        {selected.roomTypes.length ? <ul className="list-inside list-disc space-y-2">{selected.roomTypes.map((room, index) => <li key={index} dir="auto">{room}</li>)}</ul> : <p>أنواع الغرف غير مسجلة في المصدر.</p>}
        <p className="text-sm text-muted-foreground">{selected.roomSource === "unverified" ? "قائمة الغرف غير متحققة؛ يلزم تأكيدها مع الفرع قبل إفادة الضيف." : "تُراجع الإتاحة والأسعار مع الفندق قبل تأكيد الحجز."}</p>
        {selected.workbook && <div className="space-y-4 border-t pt-5"><h4 className="font-bold">الغرف المتصلة (الكونكت)</h4><WorkbookFacts details={selected.workbook} fields={["connectingRooms"]} />{selected.workbook.connectingRoomTypes.length ? <ul className="list-inside list-disc space-y-2 leading-7">{selected.workbook.connectingRoomTypes.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p className="text-sm text-muted-foreground">أنواع الكونكت غير مفصلة في الشيت.</p>}<p className="text-xs leading-6 text-muted-foreground">تفاصيل الربط كما وردت في جدول الكونكت؛ المدخل المشترك لا يعني وجود باب داخلي بين الغرف. يُراجع نوع الربط مع الفرع.</p></div>}
      </section>
      <section className="page-surface space-y-4"><h3 className="text-lg font-bold text-primary">القاعات وبكج العرسان</h3><p className="whitespace-pre-wrap leading-7">القاعات: {text(selected.hallPackages[0])}</p><p className="whitespace-pre-wrap leading-7">بكج العرسان: {text(selected.hallPackages[1])}</p>{selected.hallPackages.length > 2 && <ul className="list-inside list-disc space-y-2">{selected.hallPackages.slice(2).map((item, index) => <li key={index} className="whitespace-pre-wrap leading-7">{item}</li>)}</ul>}</section>
      {selected.workbook && <details className="page-surface text-sm"><summary className="cursor-pointer font-semibold">مصدر التفاصيل وتاريخ الاستيراد</summary><p className="mt-4 break-words">{selected.workbook.sourceName} · {selected.workbook.importedOn}</p><ul className="mt-3 space-y-2">{selected.workbook.references.map(ref => <li key={ref.sheet}>{ref.sheet} — الصفوف: {ref.rows.join("، ")}</li>)}</ul><p className="mt-3 text-muted-foreground">بيانات الشيت نسخة مستوردة وليست متابعة حية لتوفر الخدمات. أنواع الغرف والوجبات الإضافية التي لم يتضمنها الشيت تبقى من الدليل المسجل.</p></details>}
      {!publicView && <section className="page-surface space-y-4"><h3 className="text-lg font-bold text-primary">الملاحظات والمصادر</h3><p className="whitespace-pre-wrap leading-7">{text(selected.notes)}</p>{extra?.notes && extra.notes !== selected.notes && <p className="whitespace-pre-wrap leading-7">{extra.notes}</p>}
        <ul className="space-y-2">{selected.sourceFiles.map((source, index) => <li key={index}>{safeUrl(source) ? <a href={safeUrl(source)} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">مصدر المعلومات {index + 1}</a> : <span className="break-words">{source}</span>}</li>)}</ul>
        {selected.attachments.map((attachment, index) => <p key={index}>{safeUrl(attachment.url) ? <a href={safeUrl(attachment.url)} target="_blank" rel="noopener noreferrer" className="text-primary underline">{attachment.title}</a> : <span>{attachment.title} — رابط غير متاح</span>}</p>)}
        <p className="text-sm text-muted-foreground">التفاصيل والأسعار بحسب البيانات المسجلة، وليست تأكيدًا للإتاحة الحالية. يُرجى مراجعة الفرع عند نقص المعلومات أو تعارضها.</p>
      </section>}
    </>}
  </div>;
}

export function InternalHotelInformation() {
  return <InternalKnowledgeBoundary><HotelInformationContent /></InternalKnowledgeBoundary>;
}

export default function HotelInformation() {
  return <PublicHotelBoundary><HotelInformationContent publicView /></PublicHotelBoundary>;
}
