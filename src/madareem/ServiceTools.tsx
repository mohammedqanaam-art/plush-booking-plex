import { useState } from "react";
import { ArrowUpLeft, BedDouble, Calculator, Check, ChevronLeft, Copy, ExternalLink, GitCompareArrows, Headphones, Phone, SlidersHorizontal, Table2, LayoutGrid, X } from "lucide-react";
import { official, rooms, type Room, type Section } from "./data";
import { roomChecks } from "./supplement";
import { filterRooms, parseAmount } from "./service-utils";

type CopyAction = (text: string, id: string) => Promise<void>;
export function ServiceShortcuts({ navigate }: { navigate: (id: Section) => void }) {
  const services = [
    { id: "rooms", title: "اختيار الإقامة", text: "صفِّ الفئات وقارن المواصفات", icon: BedDouble },
    { id: "protocol", title: "الردود وإدارة المكالمة", text: "صياغات عربية وإنجليزية", icon: Headphones },
    { id: "calculator", title: "حساب الخصم", text: "المبلغ النهائي وقيمة التوفير", icon: Calculator },
    { id: "contacts", title: "التواصل مع الأقسام", text: "الأرقام والتحويلات والبريد", icon: Phone },
  ];
  return <section className="md-service-launcher" aria-label="خدمات موظف الحجز السريعة">{services.map((s, i) => <button key={s.id} onClick={() => {
    if (s.id === "calculator") { document.getElementById("md-calculator")?.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById("md-amount")?.focus({ preventScroll: true }); }
    else navigate(s.id as Section);
  }}><span className="md-service-top"><s.icon size={24} /><span>{String(i + 1).padStart(2, "0")}</span></span><strong>{s.title}</strong><span className="md-service-caption">{s.text}<ArrowUpLeft size={17} /></span></button>)}</section>;
}

const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DiscountCalculator({ copy, copied }: { copy: CopyAction; copied: string }) {
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const base = parseAmount(amount), percent = parseAmount(discount);
  const amountInvalid = amount.trim() !== "" && (!Number.isFinite(base) || base > 1e9);
  const discountInvalid = discount.trim() !== "" && (!Number.isFinite(percent) || percent > 100);
  const valid = amount.trim() !== "" && discount.trim() !== "" && !amountInvalid && !discountInvalid;
  const net = valid ? Math.round((base * (1 - percent / 100) + Number.EPSILON) * 100) / 100 : 0;
  return <section id="md-calculator" className="md-calculator md-panel">
    <div className="md-section-head"><h2><Calculator size={19} />حاسبة الخصم</h2><span>ريال سعودي</span></div>
    <div className="md-calculator-inputs"><label htmlFor="md-amount">المبلغ<input id="md-amount" type="text" inputMode="decimal" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} placeholder="مثال: ٢٠٠٠" aria-invalid={amountInvalid} aria-describedby={amountInvalid ? "md-calculation-error" : undefined} /></label><label htmlFor="md-discount">الخصم %<input id="md-discount" type="text" inputMode="decimal" autoComplete="off" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="مثال: ٢٠" aria-invalid={discountInvalid} aria-describedby={discountInvalid ? "md-calculation-error" : undefined} /></label><div className="md-total" aria-live="polite"><span>بعد الخصم</span><strong dir="ltr">{valid ? money(net) : "—"}</strong></div></div>
    {(amountInvalid || discountInvalid) && <p id="md-calculation-error" className="md-field-error" role="alert">{amountInvalid ? "أدخل مبلغًا صحيحًا من صفر إلى مليار، بمنزلتين عشريتين كحد أقصى." : "أدخل نسبة صحيحة من 0 إلى 100، بمنزلتين عشريتين كحد أقصى."}</p>}
    {valid && <div className="md-calculation-summary"><span>قيمة الخصم <b dir="ltr">{money(base - net)}</b> ر.س</span><button className="md-copy" onClick={() => copy(`المبلغ: ${money(base)} ريال\nالخصم: ${percent}% (${money(base - net)} ريال)\nبعد الخصم: ${money(net)} ريال\nنتيجة حسابية فقط؛ لا تتضمن إضافة ضرائب أو رسوم.`, "calculation")}>{copied === "calculation" ? <Check size={15} /> : <Copy size={15} />}{copied === "calculation" ? "تم النسخ" : "نسخ الحساب"}</button></div>}
    <p className="md-muted">حساب فقط؛ تطبيق الخصم مرتبط بأهلية العرض المعتمد. لا تُضاف ضرائب أو رسوم تلقائيًا.</p>
  </section>;
}

export function RoomExplorer({ copy, copied }: { copy: CopyAction; copied: string }) {
  const [group, setGroup] = useState("الكل");
  const [adults, setAdults] = useState("");
  const [feature, setFeature] = useState("");
  const [order, setOrder] = useState("");
  const [table, setTable] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const filtered = filterRooms(group, adults, feature, order);
  const compared = selected.map(id => rooms.find(r => r.id === id)!);
  const clearFilters = () => { setGroup("الكل"); setAdults(""); setFeature(""); setOrder(""); };
  function toggle(id: string) { setSelected(list => list.includes(id) ? list.filter(x => x !== id) : list.length < 3 ? [...list, id] : list); }
  function roomText(r: Room) { return `${r.name} (${r.english})\nالمساحة: ${r.area} م² | السعة المنشورة: ${r.adults} بالغ\n${r.bed}. ${r.features}${r.note ? `\n${r.note}` : ""}\nالتوافر والسعر يحتاجان تأكيدًا.\n${official}${r.source}`; }
  function selectButton(r: Room) { return <button className={`md-compare-select ${selected.includes(r.id) ? "is-selected" : ""}`} aria-pressed={selected.includes(r.id)} disabled={selected.length === 3 && !selected.includes(r.id)} onClick={() => toggle(r.id)} aria-label={`${selected.includes(r.id) ? "إزالة من المقارنة" : "أضف للمقارنة"}: ${r.name}`}>{selected.includes(r.id) ? <Check size={16} /> : <GitCompareArrows size={16} />}{selected.includes(r.id) ? "ضمن المقارنة" : "أضف للمقارنة"}</button>; }
  return <>
    <section className="md-room-controls" aria-label="اختيار فئة الإقامة">
      <div className="md-filter-row"><div className="md-filters" aria-label="تصفية فئات الإقامة">{["الكل", "غرف", "أجنحة", "فلل"].map(g => <button key={g} aria-pressed={group === g} className={group === g ? "selected" : ""} onClick={() => setGroup(g)}>{g}<span>{g === "الكل" ? rooms.length : rooms.filter(r => r.group === g).length}</span></button>)}</div><button className="md-view-toggle" onClick={() => setTable(!table)}>{table ? <LayoutGrid size={18} /> : <Table2 size={18} />}{table ? "عرض البطاقات" : "جدول مقارنة"}</button></div>
      <div className="md-room-filters"><label>عدد البالغين في الوحدة<select value={adults} onChange={e => setAdults(e.target.value)}><option value="">جميع السعات</option>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></label><label>ميزة مطلوبة<select value={feature} onChange={e => setFeature(e.target.value)}><option value="">جميع المزايا</option><option value="pool">مسبح خاص</option><option value="jacuzzi">جاكوزي</option><option value="kitchen">مطبخ</option><option value="twin">أسرة منفصلة</option><option value="accessible">تجهيزات لذوي الإعاقة</option></select></label><label>ترتيب الفئات<select value={order} onChange={e => setOrder(e.target.value)}><option value="">ترتيب الدليل</option><option value="area">المساحة: الأصغر أولًا</option></select></label></div>
      <div className="md-filter-summary"><span role="status"><SlidersHorizontal size={16} />{filtered.length} من {rooms.length} فئة تطابق الاختيار</span>{(group !== "الكل" || adults || feature || order) && <button onClick={clearFilters}><X size={15} />مسح الفلاتر</button>}</div>
      <p className="md-muted">التصفية حسب المواصفات المنشورة؛ لا تعني توافر وحدات للحجز. الأطفال والمرافقون يحتاجون مراجعة منفصلة.</p>
    </section>
    {selected.length > 0 && <section className="md-compare-tray" aria-label="الفئات المختارة للمقارنة"><div><GitCompareArrows size={20} /><strong>المقارنة {selected.length}/3</strong><span>{compared.map(r => r.name).join(" · ")}</span></div><button className="md-solid-button" disabled={selected.length < 2} onClick={() => setShowComparison(!showComparison)}>{showComparison ? "إخفاء المقارنة" : selected.length < 2 ? "اختر فئة ثانية للمقارنة" : "قارن الفئات المختارة"}<ChevronLeft size={17} /></button><button onClick={() => { setSelected([]); setShowComparison(false); }} aria-label="إفراغ المقارنة"><X size={19} /></button></section>}
    {showComparison && compared.length > 1 && <section className="md-comparison"><div className="md-section-head"><h2>المقارنة التفصيلية</h2><button onClick={() => copy(compared.map(roomText).join("\n\n———\n\n"), "room-comparison")}>{copied === "room-comparison" ? <Check size={16} /> : <Copy size={16} />}{copied === "room-comparison" ? "تم النسخ" : "نسخ المقارنة"}</button></div><div className="md-table-wrap" tabIndex={0} role="region" aria-label="جدول المقارنة التفصيلية"><table className="md-table md-compare-table"><caption className="sr-only">مقارنة الفئات المختارة</caption><thead><tr><th>المواصفة</th>{compared.map(r => <th key={r.id}>{r.name}</th>)}</tr></thead><tbody>{[{ title: "المساحة", value: (r: Room) => `${r.area} م²` }, { title: "السعة المنشورة للبالغين", value: (r: Room) => r.adults }, { title: "الأسرة والتكوين", value: (r: Room) => r.bed }, { title: "المزايا", value: (r: Room) => r.features }, { title: "قبل التأكيد", value: (r: Room) => r.note || "راجع التوافر والسعر والطلبات الخاصة." }].map(row => <tr key={row.title}><th scope="row">{row.title}</th>{compared.map(r => <td key={r.id}>{row.value(r)}</td>)}</tr>)}<tr><th scope="row">المصدر</th>{compared.map(r => <td key={r.id}><a className="md-source" href={`${official}${r.source}`} target="_blank" rel="noreferrer">صفحة الفئة<ExternalLink size={13} /></a></td>)}</tr></tbody></table></div></section>}
    {!filtered.length ? <div className="md-empty"><BedDouble size={32} /><h2>لا توجد فئة بهذه المواصفات المنشورة</h2><p>غيّر إحدى المواصفات أو راجع الفندق لترتيب أكثر من وحدة.</p><button onClick={clearFilters}>عرض جميع الفئات</button></div> : table ? <div className="md-table-wrap" tabIndex={0} role="region" aria-label="جدول فئات الإقامة"><table className="md-table"><caption>فئات الإقامة — السعات المنشورة للبالغين</caption><thead><tr><th>الفئة</th><th>المساحة م²</th><th>البالغون</th><th>الأسرة / التكوين</th><th>المقارنة</th></tr></thead><tbody>{filtered.map(r => <tr key={r.id}><td><b>{r.name}</b><small lang="en">{r.english}</small><a className="md-source" href={`${official}${r.source}`} target="_blank" rel="noreferrer">تفاصيل الفئة<ExternalLink size={13} /></a></td><td dir="ltr">{r.area}</td><td>{r.adults}</td><td>{r.bed}</td><td>{selectButton(r)}</td></tr>)}</tbody></table></div> : <div className="md-room-grid">{filtered.map(r => <article className={`md-room ${selected.includes(r.id) ? "md-room-selected" : ""}`} key={r.id}>
      <div className="md-room-top"><span className="md-room-type">{r.group}</span>{selectButton(r)}</div><h3>{r.name}</h3><p className="md-room-en" lang="en">{r.english}</p><div className="md-room-numbers"><div><strong dir="ltr">{r.area}</strong><span>متر مربع</span></div><div><strong>{r.adults}</strong><span>السعة للبالغين</span></div></div><div className="md-bed"><BedDouble size={18} />{r.bed}</div><p className="md-room-desc">{r.features}</p>{r.note && <p className="md-note">{r.note}</p>}<details className="md-room-details"><summary>أسئلة التأكيد قبل الحجز</summary><ul>{roomChecks[r.id]?.map(x => <li key={x}>{x}</li>)}</ul><p>عدد وحدات هذه الفئة يُراجع مع الفندق.</p></details><div className="md-card-foot"><a className="md-source" href={`${official}${r.source}`} target="_blank" rel="noreferrer">تفاصيل الفئة<ExternalLink size={13} /></a><button className="md-copy" onClick={() => copy(roomText(r), r.id)} aria-label={`نسخ تفاصيل ${r.name}`}>{copied === r.id ? <Check size={15} /> : <Copy size={15} />}{copied === r.id ? "تم النسخ" : "نسخ التفاصيل"}</button></div>
    </article>)}</div>}
  </>;
}
