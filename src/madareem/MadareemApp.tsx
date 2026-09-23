import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpLeft, BedDouble, BookOpen, CalendarClock, Check, CheckCheck, ChevronLeft, CircleHelp, ClipboardList, Copy, ExternalLink, FileCheck2, LayoutGrid, MapPin, Menu, Phone, Search, ShieldCheck, Users, UtensilsCrossed, Waves, X } from "lucide-react";
import { contacts, facts, halls, official, reviewedAt, searchFacts, sourceList, type Fact, type Section } from "./data";
import { protocols, englishReplies } from "./supplement";
import "./madareem.css";
import "./luxury.css";
import { DiscountCalculator, RoomExplorer, ServiceShortcuts } from "./ServiceTools";
import "./services.css";

const sections: { id: Section; label: string; icon: typeof BookOpen }[] = [
  { id: "overview", label: "خدمات موظف الحجز", icon: BookOpen },
  { id: "rooms", label: "الغرف والأجنحة والفلل", icon: BedDouble },
  { id: "dining", label: "المطاعم والمقاهي", icon: UtensilsCrossed },
  { id: "services", label: "المرافق والخدمات", icon: Waves },
  { id: "halls", label: "القاعات والمناسبات", icon: Users },
  { id: "policies", label: "سياسات الإقامة", icon: ShieldCheck },
  { id: "protocol", label: "الردود وإدارة المكالمة", icon: ClipboardList },
  { id: "contacts", label: "دليل الاتصال", icon: Phone },
  { id: "review", label: "المصادر والاعتماد", icon: FileCheck2 },
];
const getSection = (): Section => sections.some(s => s.id === window.location.hash.slice(1)) ? window.location.hash.slice(1) as Section : "overview";
const sourceUrl = (source: string) => `${official}${source}`;

function Source({ source, label = "المصدر الرسمي" }: { source?: string; label?: string }) {
  return source ? <a className="md-source" href={sourceUrl(source)} target="_blank" rel="noreferrer">{label}<ExternalLink size={13} /></a> : <span className="md-pending">بانتظار اعتماد الفندق</span>;
}

export default function MadareemApp() {
  const [section, setSection] = useState<Section>(getSection);
  const [query, setQuery] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchScope, setSearchScope] = useState<Section | "all">("all");
  const [replyLanguage, setReplyLanguage] = useState<"ar" | "en">("ar");
  const searchInput = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState("");
  const results = useMemo(() => searchFacts(query), [query]);
  const shownResults = searchScope === "all" ? results : results.filter(f => f.section === searchScope);
  function updateQuery(value: string) { setQuery(value); setSearchScope("all"); }
  const page = sections.find(s => s.id === section)!;
  const isSearching = Boolean(query.trim());

  useEffect(() => {
    const listener = () => { if (window.location.hash === "#main-content") return; setSection(getSection()); setQuery(""); setMobileMenu(false); };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToast(""); setCopied(""); }, 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const editing = event.target instanceof HTMLElement && (event.target.closest("input, textarea, select") || event.target.isContentEditable);
      if (event.key === "/" && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); searchInput.current?.focus(); }
      if (event.key === "Escape") { setMobileMenu(false); setQuery(""); setSearchScope("all"); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  function navigate(id: Section) {
    setSection(id); setQuery(""); setMobileMenu(false);
    window.location.hash = id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copy(text: string, id: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(id); setToast("تم نسخ المعلومة");
    } catch {
      setToast("تعذّر النسخ التلقائي؛ حدّد النص وانسخه يدويًا.");
    }
  }

  function CopyButton({ text, id, label = "نسخ الإجابة" }: { text: string; id: string; label?: string }) {
    return <button className="md-copy" onClick={() => copy(text, id)} aria-label={`${label}: ${id}`}>{copied === id ? <Check size={15} /> : <Copy size={15} />}{copied === id ? "تم النسخ" : label}</button>;
  }

  function FactCard({ fact }: { fact: Fact }) {
    const copyText = `${fact.title}: ${fact.text}${fact.hours ? `\nالمواعيد: ${fact.hours}` : ""}${fact.extension ? `\nتحويلة: ${fact.extension}` : ""}${fact.note ? `\nملاحظة: ${fact.note}` : ""}`;
    return <article className={`md-fact ${fact.pending ? "md-fact-pending" : ""}`}>
      {isSearching && <span className="md-result-category">{sections.find(s => s.id === fact.section)?.label}</span>}<div className="md-fact-head"><h3>{fact.title}</h3>{fact.pending ? <CircleHelp size={18} /> : <BookOpen size={17} />}</div>
      <p>{fact.text}</p>
      {fact.hours && <div className="md-time"><CalendarClock size={17} /><span>{fact.hours}</span></div>}
      {fact.extension && <div className="md-extension"><span>تحويلة القسم</span><b dir="ltr">{fact.extension}</b></div>}
      {fact.note && <p className="md-note">{fact.note}</p>}
      <div className="md-card-foot"><>{fact.section === "protocol" ? <span className="md-pending">إرشاد وصياغة مقترحة</span> : <Source source={fact.source} />}</><CopyButton text={copyText} id={fact.id} /></div>
    </article>;
  }

  return <div className="md-app" dir="rtl">
    <a className="md-skip" href="#main-content">انتقل إلى المحتوى</a>
    {mobileMenu && <button className="md-backdrop" aria-label="إغلاق القائمة" onClick={() => setMobileMenu(false)} />}
    <aside className={`md-sidebar ${mobileMenu ? "is-open" : ""}`}>
      <div className="md-brand"><a className="md-brand-content" href="#overview" onClick={e => { e.preventDefault(); navigate("overview"); }} aria-label="فندق مداريم بالرياض — الصفحة الرئيسية"><img className="md-brand-logo" src="/madareem-logo.png" width="350" height="100" alt="شعار فندق مداريم" /><span>فندق مداريم · الرياض</span></a><button className="md-mobile-close" aria-label="إغلاق القائمة" onClick={() => setMobileMenu(false)}><X /></button></div>
      <div className="md-sidebar-label">خدمات موظف الحجز</div>
      <nav aria-label="أقسام الدليل">{sections.map(s => <a key={s.id} href={`#${s.id}`} onClick={e => { e.preventDefault(); navigate(s.id); }} aria-current={section === s.id && !isSearching ? "page" : undefined} className={section === s.id && !isSearching ? "active" : ""}><s.icon size={19} /><span>{s.label}</span>{s.id === "review" && <b className="md-nav-count">4</b>}</a>)}</nav>
      <div className="md-sidebar-bottom"><span>الحجز والاستقبال</span><a href="tel:+966112758888" dir="ltr">011 275 8888 <Phone size={17} /></a><p>فرع واحد · مصدر معلومات واحد</p><a className="md-official-link" href={official} target="_blank" rel="noreferrer">موقع الفندق الرسمي <ArrowUpLeft size={16} /></a></div>
    </aside>

    <div className="md-workspace">
      <header className="md-header"><div className="md-breadcrumb"><button className="md-menu" aria-label="فتح القائمة" aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)}><Menu size={22} /></button><span>مداريم الرياض</span><ChevronLeft size={15} /><b>{isSearching ? "نتائج البحث" : page.label}</b></div><img className="md-header-logo" src="/madareem-logo.png" width="350" height="100" alt="فندق مداريم" /><span className="md-review-date"><FileCheck2 size={16} />مراجعة المصادر: {reviewedAt}</span></header>
      <main id="main-content" tabIndex={-1}>
        <div className="md-page-heading"><div><p className="md-eyebrow">MADAREEM · EMPLOYEE SERVICES</p><h1>{isSearching ? "المعلومة التي تحتاجها" : section === "overview" ? "خدمات موظف الحجز" : page.label}</h1><p className="md-subtitle">{section === "overview" ? "معلومات الفندق وأدواتك اليومية لخدمة الضيف." : section === "rooms" ? "المساحة، السعة، والتجهيزات لكل فئة إقامة." : section === "review" ? "المعلومات المنشورة ومتطلبات استكمال الدليل التشغيلي." : "مرجع سريع مبني على المعلومات المنشورة من الفندق."}</p></div><a className="md-location" href="https://www.google.com/maps/search/?api=1&query=Madareem+Hotel+Riyadh" target="_blank" rel="noreferrer"><MapPin size={18} /><span>الفلاح · مخرج 8</span><ArrowUpLeft size={16} /></a></div>

        <div className="md-search-box"><Search size={22} /><label className="sr-only" htmlFor="md-search">ابحث في جميع معلومات الفندق</label><input ref={searchInput} id="md-search" value={query} onChange={e => updateQuery(e.target.value)} placeholder="ابحث: غرفة توين، وقت الإفطار، دخول مبكر، تحويلة السبا…" autoComplete="off" />{query ? <button aria-label="مسح البحث" onClick={() => updateQuery("")}><X size={19} /></button> : <span className="md-search-hint">للبحث السريع <kbd>/</kbd></span>}</div>

        {isSearching ? <section aria-label="نتائج البحث"><div className="md-section-head"><h2>نتائج البحث</h2><span role="status">{shownResults.length} نتيجة</span></div><div className="md-search-scopes" role="group" aria-label="تصفية نتائج البحث"><button aria-pressed={searchScope === "all"} onClick={() => setSearchScope("all")}>الكل <span>{results.length}</span></button>{sections.filter(s => results.some(f => f.section === s.id)).map(s => <button key={s.id} aria-pressed={searchScope === s.id} onClick={() => setSearchScope(s.id)}>{s.label}<span>{results.filter(f => f.section === s.id).length}</span></button>)}</div>{shownResults.length ? <div className="md-fact-grid">{shownResults.map(f => <FactCard fact={f} key={f.id} />)}</div> : <div className="md-empty"><Search size={34} /><h2>لا توجد معلومة مطابقة</h2><p>جرّب كلمة أقصر مثل «إفطار» أو «مسبح». للمعلومة غير المنشورة، ارجع إلى الفندق.</p><button onClick={() => navigate("review")}>عرض المعلومات المطلوب اعتمادها</button></div>}</section> : <>
          {section === "overview" && <>
            <ServiceShortcuts navigate={navigate} />
            <section className="md-hotel-cover" aria-label="بطاقة فندق مداريم"><div className="md-cover-copy"><span className="md-cover-kicker">MADAREEM HOTEL · RIYADH</span><h2>فندق مداريم</h2><p>الفلاح · طريق المطار · مخرج 8</p><div className="md-cover-facts"><span>4 نجوم وفق موقع الفندق</span><span>25,000 م² تقريبًا</span></div><a href="tel:+966112758888" dir="ltr"><Phone size={18} />011 275 8888</a></div><figure><img src="/madareem-night.jpg" alt="فندق مداريم مساءً — صورة من موقع الفندق الرسمي" width="900" height="600" /><figcaption><a href={`${official}/about-us/`} target="_blank" rel="noreferrer">صورة ومعلومات الفندق الرسمية <ExternalLink size={12} /></a></figcaption></figure></section>

            <div className="md-stats"><article className="md-stat md-stat-primary"><span>إجمالي وحدات الإقامة</span><strong>180<BedDouble size={30} /></strong><small>غرف وأجنحة وفلل <Source source="/about-us/" label="المصدر" /></small></article><article className="md-stat"><span>فئات الإقامة المنشورة</span><strong>11<LayoutGrid size={26} /></strong><small>4 غرف · 5 أجنحة · فئتا فلل</small></article><article className="md-stat"><span>القاعات والمناسبات</span><strong>13<Users size={26} /></strong><small>سعات منشورة من 12 إلى 500 ضيف</small></article><article className="md-stat"><span>الدخول / المغادرة</span><strong className="md-stat-time" dir="ltr">14:00 <span>/</span> 12:00</strong><small>بتوقيت الرياض <Source source="/faq/" label="المصدر" /></small></article></div>
            <div className="md-overview-grid"><section className="md-panel"><div className="md-section-head"><h2>الأكثر استخدامًا في المكالمة</h2><span>وصول سريع</span></div><div className="md-shortcuts">{[{ q: "الإفطار", label: "وقت الإفطار", icon: UtensilsCrossed }, { q: "دخول مبكر", label: "الدخول المبكر", icon: CalendarClock }, { q: "سرير إضافي", label: "الأطفال والأسرة", icon: BedDouble }, { q: "الإلغاء", label: "شروط الإلغاء", icon: ShieldCheck }, { q: "مسبح", label: "المسابح", icon: Waves }, { q: "تحويلة", label: "تحويلات الأقسام", icon: Phone }].map(x => <button onClick={() => updateQuery(x.q)} key={x.q}><x.icon size={21} /><span>{x.label}</span><ChevronLeft size={16} /></button>)}</div></section><section className="md-call-note"><span className="md-tag"><ClipboardList size={16} />قبل تأكيد الحجز</span><h2>اسأل. تحقّق. ثم أكّد.</h2><ol><li>التواريخ، عدد البالغين وأعمار الأطفال.</li><li>الفئة، نوع السرير، الوجبات والطلبات الخاصة.</li><li>التوافر والسعر النهائي وشروط الحجز في النظام.</li></ol><span className="md-muted">تسلسل مقترح للمكالمة</span></section></div>
            <div className="md-section-head"><h2>بطاقة الفندق</h2><button onClick={() => navigate("contacts")}>دليل الاتصال<ChevronLeft size={16} /></button></div>
            <div className="md-fact-grid">{facts.filter(f => f.section === "overview").map(f => <FactCard fact={f} key={f.id} />)}</div>
            <div className="md-bottom-grid"><DiscountCalculator copy={copy} copied={copied} /><section className="md-completion"><FileCheck2 size={24} /><div><h2>أكمل بيانات التشغيل</h2><p>توزيع مخزون الغرف والأسعار وسياسات الدفع تحتاج اعتماد الفندق.</p></div><button onClick={() => navigate("review")} aria-label="عرض متطلبات اعتماد الفندق"><ArrowUpLeft size={22} /></button></section></div>
          </>}

          {section === "rooms" && <>
            <section className="md-photo-banner"><img src="/royal-suite.jpg" alt="الجناح الملكي في فندق مداريم" loading="lazy" width="900" height="600" /><div><span className="md-eyebrow">ROOMS · SUITES · VILLAS</span><h2>اختَر الفئة على أساس احتياج الضيف</h2><p>قارن السعة والمساحة وتكوين الأسرة، ثم راجع تفاصيل الطلب قبل التأكيد.</p><a className="md-source" href={`${official}/royal-suite/`} target="_blank" rel="noreferrer">الصورة: الجناح الملكي <ExternalLink size={13} /></a></div></section>

            <div className="md-information"><BedDouble size={21} /><p><b>180 وحدة إجمالًا.</b> الأعداد التفصيلية لكل فئة غير منشورة. السعات أدناه للبالغين؛ تُراجع إضافة الأطفال والمرافقين مع الفندق.</p></div>
            <RoomExplorer copy={copy} copied={copied} />
            <div className="md-section-bottom"><span>الأسعار والتوافر تُراجع حسب تاريخ الإقامة وخطة السعر.</span><Source source="/room-type/" label="قائمة فئات الفندق" /></div>
          </>}

          {["dining", "services", "policies"].includes(section) && <>
            {section === "dining" && <section className="md-photo-banner"><img src="/tropicana.jpg" alt="مطعم تروبيكانا في فندق مداريم" loading="lazy" width="900" height="600" /><div><span className="md-eyebrow">DINING AT MADAREEM</span><h2>المطاعم والمقاهي في مكان واحد</h2><p>أوقات الوجبات، نوع الجلسة، وتحويلة القسم لتأكيد طلب الضيف.</p><Source source="/restaurant/" label="الصورة: مطعم تروبيكانا" /></div></section>}

            <div className="md-information"><CircleHelp size={21} /><p>{section === "policies" ? "هذه السياسات العامة المنشورة. تُراجع شروط الحجز المحدد قبل تقديم التزام للضيف، خصوصًا الإلغاء والرسوم." : "المواعيد المنشورة بتوقيت الرياض، وقد تتغير في المواسم. أكّد التفاصيل الخاصة والرسوم مع القسم المعني."}</p></div>
            <div className="md-fact-grid">{facts.filter(f => f.section === section).map(f => <FactCard fact={f} key={f.id} />)}</div>
          </>}

          {section === "halls" && <>
            <div className="md-fact-grid md-hall-intro">{facts.filter(f => f.section === "halls").map(f => <FactCard key={f.id} fact={f} />)}</div>
            <div className="md-information"><Users size={21} /><p><b>13 قاعة منشورة:</b> 11 للاجتماعات ومناسبات الأعمال، وقاعتان للزفاف. تُراجع السعة مع القسم حسب شكل الجلوس والتجهيزات.</p></div>
            <div className="md-table-wrap"><table className="md-table"><caption>قاعات الاجتماعات والزفاف</caption><thead><tr><th>القاعة</th><th>النوع</th><th>السعة حتى</th><th>التوزيع المنشور</th><th>المصدر</th></tr></thead><tbody>{halls.map(h => <tr key={h.english}><td><b>{h.name}</b><small lang="en">{h.english}</small></td><td>{h.wedding ? "زفاف ومناسبات" : "اجتماعات"}</td><td><b className="md-capacity">{h.capacity}</b> ضيف</td><td>{h.layout || "يُراجع مع القسم"}</td><td><Source source={h.wedding ? "/wedding/" : "/meeting-events/"} /></td></tr>)}</tbody></table></div>
            <div className="md-contact-strip"><div><h3>تنسيق الاجتماعات والمناسبات</h3><p>التاريخ، عدد الحضور، التوزيع، الضيافة والتجهيزات المطلوبة.</p></div><span>تحويلة <b dir="ltr">7744</b></span><a href="tel:+966505932876" dir="ltr">050 593 2876<Phone size={18} /></a></div>
          </>}

          {section === "protocol" && <>
            <div className="md-information"><ClipboardList size={22} /><p>إرشادات وصياغات مقترحة لدعم المكالمة؛ ليست سياسات معتمدة من الفندق. اختر الحالة لعرض خطوات العمل والرد القابل للنسخ.</p></div>
            <div className="md-protocol-toolbar"><span>اختر لغة الرد الموجّه للضيف</span><div className="md-language-switch" role="group" aria-label="لغة الردود"><button aria-pressed={replyLanguage === "ar"} onClick={() => setReplyLanguage("ar")}>العربية</button><button aria-pressed={replyLanguage === "en"} onClick={() => setReplyLanguage("en")} lang="en">English</button></div></div>
            <div className="md-protocol-grid">{protocols.map((p, i) => <details className="md-protocol" key={p.id} open={i === 0}><summary><span>{String(i + 1).padStart(2, "0")}</span><h2>{p.title}</h2><ChevronLeft size={18} /></summary><div className="md-protocol-body"><p>{p.intro}</p><ol>{p.steps.map(step => <li key={step}>{step}</li>)}</ol><div className="md-reply"><span>صياغة مقترحة للضيف</span><p lang={replyLanguage} dir={replyLanguage === "en" ? "ltr" : "rtl"}>{replyLanguage === "en" ? englishReplies[p.id] : p.reply}</p><CopyButton text={replyLanguage === "en" ? englishReplies[p.id] : p.reply} id={`reply-${p.id}`} label="نسخ الرد" /></div></div></details>)}</div>
          </>}

          {section === "contacts" && <>
            <div className="md-contact-hero"><div><span>الهاتف الرئيسي</span><a href="tel:+966112758888" dir="ltr">011 275 8888</a></div><div><span>الحجوزات</span><a className="md-email" href="mailto:reservation@hotelmadareem.com">reservation@hotelmadareem.com</a></div><CopyButton text="0112758888\nreservation@hotelmadareem.com" id="main-contact" label="نسخ بيانات التواصل" /></div>
            <div className="md-table-wrap"><table className="md-table"><caption>تحويلات الأقسام على الهاتف الرئيسي 0112758888</caption><thead><tr><th>القسم</th><th>التحويلة / الهاتف</th><th>البريد</th><th>إجراء</th></tr></thead><tbody>{contacts.map((c, i) => <tr key={c.name}><td><b>{c.name}</b><Source source={c.source} label="المصدر" /></td><td>{c.extension && <span className="md-number" dir="ltr">{c.extension}</span>}{c.phone && <a className="md-phone-number" href={`tel:+966${c.phone.slice(1)}`} dir="ltr">{c.phone}</a>}</td><td>{c.email ? <a className="md-email" href={`mailto:${c.email}`}>{c.email}</a> : "—"}</td><td><CopyButton text={`${c.name}: ${c.phone || "0112758888"}${c.extension ? ` تحويلة ${c.extension}` : ""}${c.email ? `\n${c.email}` : ""}`} id={`phone-${i}`} label="نسخ" /></td></tr>)}</tbody></table></div>
            <div className="md-information"><CircleHelp size={21} /><p>صفحة الزفاف تنشر بريدًا بنطاق madareemcrown.com، وصفحة الاجتماعات تنشر f.b@hotelmadareem.com؛ يُؤكد بريد قسم المناسبات الحالي هاتفيًا. هذه أرقام اتصال منشورة، وليست تأكيدًا لتفعيل واتساب عليها.</p></div>
          </>}

          {section === "review" && <>
            <section className="md-review-intro"><div className="md-review-icon"><FileCheck2 size={28} /></div><div><h2>مصادر معلومات الفندق</h2><p>جُمعت المعلومات والشعار من موقع فندق مداريم الرسمي بتاريخ {reviewedAt}. تُستكمل بيانات التشغيل الداخلية من إدارة الفندق، وتُراجع الأسعار والتوافر في نظام الحجز.</p></div></section>
            <div className="md-section-head"><h2>4 مجموعات تحتاج استكمالًا</h2><span>لا تُعامل كحقائق مؤكدة</span></div><div className="md-fact-grid">{facts.filter(f => f.pending).map(f => <FactCard fact={f} key={f.id} />)}</div>
            <div className="md-section-head"><h2>المصادر الرسمية</h2><span>{sourceList.length} مرجعًا رئيسيًا + صفحات الفئات</span></div><div className="md-sources">{sourceList.map(([label, source], i) => <a href={sourceUrl(source)} target="_blank" rel="noreferrer" key={source}><span className="md-source-index">{String(i + 1).padStart(2, "0")}</span><span>{label}</span><ArrowUpLeft size={18} /></a>)}</div>
            <div className="md-information"><CheckCheck size={21} /><p>كل بطاقة غرفة مرتبطة بصفحتها الرسمية. لم يُنقل أي سجل حجز أو بيانات موظفين أو ضيوف إلى هذا الدليل، ولا توجد صلة مباشرة بنظام حجوزات الفندق.</p></div>
          </>}
        </>}
        <footer className="md-footer"><span>خدمات موظف الحجز · فندق مداريم الرياض</span><span>معلومات منشورة • راجع شروط الحجز عند التأكيد</span></footer>
      </main>
    </div>
    {toast && <div role="status" className="md-toast">{copied ? <Check size={19} /> : <CircleHelp size={19} />}{toast}</div>}
  </div>;
}
