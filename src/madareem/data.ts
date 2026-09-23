import { extraFacts, protocols } from "./supplement";
export const reviewedAt = "23 سبتمبر 2026";
export const official = "https://hotelmadareem.com";
export type Section = "protocol" | "overview" | "rooms" | "dining" | "services" | "halls" | "policies" | "contacts" | "review";
export type Fact = { id: string; section: Section; title: string; text: string; source?: string; note?: string; tags?: string; pending?: boolean; extension?: string; hours?: string };
export type Room = { id: string; name: string; english: string; group: "غرف" | "أجنحة" | "فلل"; area: string; adults: number; bed: string; features: string; source: string; note?: string };

export const rooms: Room[] = [
  { id: "king", name: "غرفة قياسية كينج", english: "Standard King Room", group: "غرف", area: "23.94", adults: 2, bed: "سرير كينج", features: "إطلالة على المدينة أو الحديقة. خيارات للتدخين ولغير المدخنين حسب المتاح.", source: "/standard-room/" },
  { id: "twin", name: "غرفة قياسية توين", english: "Standard Twin Room", group: "غرف", area: "23.94", adults: 2, bed: "سريران منفصلان", features: "إطلالة على المدينة أو الحديقة. خيارات للتدخين ولغير المدخنين حسب المتاح.", source: "/twin_room/" },
  { id: "deluxe", name: "غرفة ديلوكس", english: "Deluxe Room", group: "غرف", area: "30.24", adults: 2, bed: "سرير كينج", features: "إطلالة على المدينة أو الحديقة. مساحة أكبر من الغرفة القياسية.", source: "/deluxe-room/" },
  { id: "vip", name: "غرفة ديلوكس VIP", english: "Deluxe VIP Room", group: "غرف", area: "35.96", adults: 2, bed: "سرير كينج", features: "جاكوزي داخل الوحدة. إطلالة على المدينة أو الحديقة.", source: "/deluxe-vip-room/" },
  { id: "junior", name: "جناح جونيور", english: "Junior Suite", group: "أجنحة", area: "49.14", adults: 2, bed: "سرير كينج", features: "إطلالة على المدينة أو الحديقة؛ خيارات للتدخين ولغير المدخنين.", source: "/junior-suite/", note: "وصف حوض الاستحمام في المصدر غير واضح؛ يُؤكد نوعه عند الطلب." },
  { id: "executive", name: "جناح تنفيذي", english: "Executive Suite", group: "أجنحة", area: "49.14", adults: 2, bed: "سرير كينج", features: "جاكوزي. إطلالة على المدينة أو الحديقة.", source: "/executive_suite/" },
  { id: "presidential", name: "جناح رئاسي", english: "Presidential Suite", group: "أجنحة", area: "155.12", adults: 2, bed: "سرير كينج", features: "جاكوزي وغرفة ملابس. إطلالة على الحديقة.", source: "/presidential-suite/" },
  { id: "royal", name: "جناح ملكي", english: "Royal Suite", group: "أجنحة", area: "454.30", adults: 4, bed: "كينج + سريران منفصلان", features: "غرفة طعام مستقلة، منطقة معيشة، تراس، جاكوزي داخلي وخارجي ونظام صوتي.", source: "/royal-suite/" },
  { id: "accessible", name: "جناح مهيأ لذوي الإعاقة", english: "Disability Suite", group: "أجنحة", area: "49.14", adults: 1, bed: "سرير كينج", features: "لغير المدخنين بإطلالة حديقة. وصول للكراسي المتحركة، تنبيهات صوتية وضوئية واهتزازية؛ سرير طبي وكرسي حمام عند الطلب.", source: "/disability-suite/", note: "المصدر يذكر بالغًا واحدًا؛ تُؤكد إمكانية إقامة المرافق قبل الحجز. خصم 15% منشور مع إبراز البطاقة عند الوصول؛ تُراجع أهلية العرض." },
  { id: "villa", name: "فيلا ديلوكس", english: "Deluxe Villa", group: "فلل", area: "182", adults: 6, bed: "3 غرف نوم", features: "غرفة رئيسية وغرفتان بسريرين منفصلين لكل غرفة، صالة، مطبخ وثلاجة. إطلالة مسبح أو حديقة.", source: "/deluxe-villa/", note: "الإطلالة على المسبح لا تعني وجود مسبح خاص." },
  { id: "pool-villa", name: "فيلا بمسبح خاص", english: "Pool Villa", group: "فلل", area: "182", adults: 6, bed: "3 غرف نوم", features: "غرفة رئيسية وغرفتان توين، صالة، مطبخ، ثلاجة ومسبح خاص.", source: "/pool-villa/", note: "يذكر التعريف الرسمي وجود فيلتين بمسبح داخلي؛ التوافر الفعلي من نظام الحجز." },
];

export const facts: Fact[] = [
  ...extraFacts,
  { id: "inventory", section: "overview", title: "عدد الغرف والوحدات", text: "180 وحدة إقامة إجمالًا تشمل الغرف والأجنحة والفلل، وفق تعريف الفندق الرسمي.", source: "/about-us/", note: "عدد الوحدات لكل فئة وعدد غرف النوم الإجمالي غير منشورين. الرقم ليس توافرًا حيًا للحجز.", tags: "كم عدد الغرف اجمالي غرفه جناح فيلا inventory room count" },
  { id: "location", section: "overview", title: "العنوان والوصول", text: "حي الفلاح، طريق المطار، مخرج 8، الرياض 11695، المملكة العربية السعودية.", source: "/contact-us/", tags: "وين الموقع عنوان لوكيشن location address" },
  { id: "classification", section: "overview", title: "التصنيف والمساحة", text: "4 نجوم حسب التعريف المنشور في موقع الفندق. مساحة الموقع نحو 25,000 م².", source: "/about-us/", note: "هذا نقل لتعريف الفندق، وليس تحققًا مستقلًا من سجل الترخيص.", tags: "تصنيف نجوم stars" },
  { id: "distance", section: "overview", title: "المطار والمترو", text: "يقدّر موقع الفندق الوصول إلى المطار بنحو 10–15 دقيقة، وإلى محطة مترو سابك بدقيقتين بالسيارة.", source: "/", note: "مدد تقريبية تتأثر بالمرور؛ تحقّق من المسار وقت الطلب.", tags: "مطار مترو سابك مسافة airport metro" },
  { id: "tropicana", section: "dining", title: "مطعم تروبيكانا", text: "بوفيه للإفطار والغداء.", hours: "الإفطار 06:15–11:00 • الغداء 12:00–16:30", extension: "7713", source: "/restaurant/", note: "شمول الوجبة وسعرها مرتبطان بخطة الحجز.", tags: "فطور افطار غداء breakfast lunch Tropicana" },
  { id: "madareem-restaurant", section: "dining", title: "مطعم مداريم", text: "بوفيه عشاء وإطلالة على المسبح، مع جلسات خارجية.", hours: "العشاء 19:15–23:59", extension: "7721", source: "/restaurant/", note: "وقت تشغيل المنفذ الخارجي بصياغة ملتبسة بالمصدر؛ يُراجع مع المطعم.", tags: "عشاء dinner buffet" },
  { id: "lobby", section: "dining", title: "لاونج اللوبي", text: "مشروبات ساخنة وباردة ووجبات خفيفة وحلويات.", hours: "08:15 صباحًا–01:00 صباح اليوم التالي", extension: "7709", source: "/restaurant/", tags: "كوفي قهوة كافيه مقهى cafe coffee lobby" },
  { id: "garden", section: "dining", title: "جاردن كافيه", text: "مقهى خارجي بين النخيل مع شاشة كبيرة.", hours: "08:00 صباحًا–00:00 منتصف الليل", extension: "7524", source: "/restaurant/", tags: "كوفي مقهى حديقة garden cafe قهوة" },
  { id: "gym", section: "services", title: "النادي الصحي والرياضي", text: "أجهزة لياقة، ساونا، جاكوزي، مساج وبلياردو.", hours: "يوميًا 06:15–23:50", extension: "7888", source: "/gym/", note: "تُراجع رسوم الخدمات وشروط الدخول والحجز مع النادي.", tags: "جيم رياضة مساج ساونا جاكوزي gym fitness massage" },
  { id: "pools", section: "services", title: "المسابح", text: "مسبحان خارجيان: أحدهما قرب مطعم مداريم والآخر بين الفلل.", source: "/gym/", note: "أوقات السباحة، الأعمار المسموحة، الخصوصية والرسوم تحتاج تأكيد النادي؛ لا تُستنتج من ساعات الجيم.", tags: "سباحة مسبح مسابح pool swimming" },
  { id: "spa", section: "services", title: "السبا النسائي", text: "عناية بالوجه، مساج، حمام مغربي، جاكوزي، ساونا وتصفيف شعر.", hours: "14:00–23:59 • مغلق الثلاثاء", extension: "608", source: "/spa/", tags: "نساء نسائي سبا spa ladies" },
  { id: "kids", section: "services", title: "نادي الأطفال", text: "مساحة للقراءة واللعب ومشاهدة التلفاز تحت الإشراف.", hours: "يوميًا 09:15–17:00", extension: "6003", source: "/kids-club/", note: "الأعمار المقبولة والرسوم ومتطلبات الإشراف تُؤكد مع النادي.", tags: "اطفال أطفال طفل نادي kids children" },
  { id: "barber", section: "services", title: "صالون الحلاقة الرجالي", text: "قص الشعر وتهذيب اللحية والعناية بالوجه.", hours: "يوميًا 11:00–23:00", extension: "7750", source: "/barber-shop/", tags: "رجال حلاق صالون barber" },
  { id: "amenities", section: "services", title: "تجهيزات وخدمات الإقامة", text: "واي فاي ومياه وشاي وقهوة مجانية؛ خدمة غرف 24 ساعة، غسيل ملابس، حفظ أمتعة، كونسيرج ومركز أعمال. تتوفر خزنة ومكواة وتلفاز ذكي.", source: "/services/", note: "وجود الخدمة لا يعني مجانيتها؛ تُراجع رسوم الخدمات المدفوعة عند الطلب.", tags: "انترنت وايفاي واي فاي laundry wifi مكواة غسيل امن خدمة غرف room service" },
  { id: "parking", section: "services", title: "مواقف السيارات والشحن", text: "خدمة صف السيارات مجانية، مع محطات لشحن السيارات الكهربائية.", source: "/faq/", note: "تُؤكد رسوم الشحن ونوع الوصلة وتوافرها.", tags: "مواقف موقف سيارة كهربائية شحن parking valet EV" },
  { id: "pets", section: "services", title: "الحيوانات الأليفة", text: "تذكر صفحة الخدمات غرفة منفصلة للحيوانات الأليفة.", source: "/services/", note: "هذا لا يثبت السماح بها داخل غرف الضيوف؛ تُراجع الشروط والرسوم مسبقًا.", tags: "قطط حيوانات كلب قطة pets" },
  { id: "check-in", section: "policies", title: "وقت الدخول", text: "الدخول من 14:00. الدخول المبكر حسب التوافر، والرسوم المنشورة 200 ريال.", source: "/faq/", note: "أكّد إمكانية الدخول والرسوم مع الاستقبال قبل الوعد للضيف.", tags: "دخول مبكر تشيك ان وصول check in early arrival" },
  { id: "check-out", section: "policies", title: "وقت المغادرة", text: "الخروج 12:00 ظهرًا. المغادرة المتأخرة بطلب مسبق؛ تتوفر خدمة حفظ الأمتعة.", source: "/faq/", tags: "خروج مغادرة متاخر تأخير check out late" },
  { id: "children", section: "policies", title: "الأطفال والأسرة الإضافية", text: "حتى عمر 5 سنوات: إقامة مجانية في غرفة الوالدين. مهد الرضيع مجاني، والسرير الإضافي مدفوع حسب التوافر.", source: "/faq/", note: "تُؤكد سعة الوحدة ورسوم السرير والوجبات قبل الحجز.", tags: "طفل اطفال رضيع مهد سرير اضافي extra bed cot child" },
  { id: "cancel", section: "policies", title: "الإلغاء", text: "السياسة العامة المنشورة: إلغاء مجاني حتى 48 ساعة قبل الوصول، ثم تُحتسب الليلة الأولى.", source: "/faq/", note: "راجع شروط السعر والقناة في الحجز المحدد قبل تأكيد الإلغاء أو الاسترداد.", tags: "كنسل الغاء إلغاء استرداد cancel cancellation refund" },
  { id: "smoking", section: "policies", title: "التدخين", text: "غرف للمدخنين وأخرى لغير المدخنين؛ يُحدد التفضيل ويُراجع التوافر.", source: "/faq/", tags: "دخان تدخين smoking non smoking" },
  { id: "transfer", section: "policies", title: "النقل من وإلى المطار", text: "خدمة نقل برسوم لكل رحلة؛ يُنسّق السعر والموعد مسبقًا.", source: "/faq/", tags: "نقل مواصلات سائق استقبال مطار airport transfer" },
  { id: "minibar", section: "policies", title: "الميني بار", text: "محتويات الميني بار برسوم إضافية.", source: "/faq/", tags: "ثلاجة سناك minibar" },
  { id: "rates", section: "review", title: "الأسعار والتوافر الحي", text: "يُستخرج السعر والتوافر من نظام الحجز وفق التواريخ، الإشغال، نوع الوحدة والوجبات. لا توجد تغذية مباشرة في هذا الدليل.", pending: true, tags: "سعر اسعار كم بكام فلوس متاح توافر غرفة الغرفة غرف غرفه جناح فيلا ليلة الليلة availability rate price booking" },
  { id: "room-counts", section: "review", title: "توزيع مخزون الغرف", text: "مطلوب جدول معتمد بعدد الوحدات لكل نوع، أكوادها، الغرف المتصلة، الطوابق، وعدد غرف النوم والحمامات.", pending: true, tags: "توزيع عدد مخزون كود متصلة كونكت connecting room inventory PMS" },
  { id: "financial-policy", section: "review", title: "الضمان والدفع وعدم الحضور", text: "مطلوب اعتماد طرق الدفع، مبلغ التأمين، الضمان، سياسة عدم الحضور، الاسترداد والمغادرة المبكرة وشروط الأسعار الخاصة.", pending: true, tags: "دفع بطاقة تأمين ضمان ضريبة تحويل رابط دفع نوشو no show payment deposit tax" },
  { id: "operating-policy", section: "review", title: "تفاصيل التشغيل الداخلية", text: "مطلوب اعتماد أسعار الوجبات والأسرة الإضافية، سياسة المسابح، وصول المرافقين، قنوات الشكاوى، وتحويلات المشرف والمناوب.", pending: true, tags: "شكوى شكاوى مشرف مناوب تعويض complaint escalation" },
];

export const halls = [
  { name: "عبدالله", english: "Abdullah", capacity: 100 },
  { name: "العلا", english: "AlUla", capacity: 65 },
  { name: "منيرة", english: "Muneera", capacity: 60 },
  { name: "نجد", english: "Najd", capacity: 50 },
  { name: "القصر", english: "AlKasr", capacity: 40 },
  { name: "الزلفي", english: "AlZulfi", capacity: 40 },
  { name: "سلمان", english: "Salman", capacity: 36 },
  { name: "مرخ", english: "Markh", capacity: 30 },
  { name: "الذيب", english: "Theeb", capacity: 16 },
  { name: "AlMalar", english: "AlMalar", capacity: 15, layout: "شكل U" },
  { name: "السبلة", english: "AlSablah", capacity: 12, layout: "شكل U" },
  { name: "مداريم", english: "Madareem", capacity: 150, wedding: true },
  { name: "الكبرى", english: "AlKubra", capacity: 500, wedding: true },
];

export const contacts = [
  { name: "الحجز والاستقبال", phone: "0112758888", email: "reservation@hotelmadareem.com", source: "/contact-us/" },
  { name: "هاتف إضافي منشور", phone: "0114665900", source: "/contact-us/" },
  { name: "تروبيكانا", extension: "7713", email: "f.b2@hotelmadareem.com", source: "/restaurant/" },
  { name: "مطعم مداريم", extension: "7721", email: "f.b2@hotelmadareem.com", source: "/restaurant/" },
  { name: "لاونج اللوبي", extension: "7709", source: "/restaurant/" },
  { name: "جاردن كافيه", extension: "7524", source: "/restaurant/" },
  { name: "القاعات والمناسبات", extension: "7744", phone: "0505932876", email: "f.b@hotelmadareem.com", source: "/meeting-events/" },
  { name: "النادي الصحي", extension: "7888", email: "fitness@hotelmadareem.com", source: "/gym/" },
  { name: "السبا النسائي", extension: "608", source: "/spa/" },
  { name: "نادي الأطفال", extension: "6003", email: "info@hotelmadareem.com", source: "/kids-club/" },
  { name: "الحلاقة الرجالية", extension: "7750", source: "/barber-shop/" },
];

export const sourceList = [
  ["تعريف الفندق وعدد الوحدات", "/about-us/"], ["فئات الغرف والفلل", "/room-type/"],
  ["الموقع والتواصل", "/contact-us/"], ["المطاعم والمقاهي", "/restaurant/"],
  ["سياسات الإقامة المنشورة", "/faq/"], ["الخدمات", "/services/"],
  ["قاعات الاجتماعات", "/meeting-events/"], ["قاعات الزفاف", "/wedding/"],
  ["النادي الصحي والمسابح", "/gym/"], ["السبا النسائي", "/spa/"],
  ["نادي الأطفال", "/kids-club/"], ["الحلاقة الرجالية", "/barber-shop/"],
];

export const searchableFacts: Fact[] = [
  ...facts,
  ...protocols.map(p => ({ id: `protocol-${p.id}`, section: "protocol" as const, title: p.title, text: p.reply, note: p.steps.join(" • "), tags: p.tags })),
  ...rooms.map(r => ({ id: `room-${r.id}`, section: "rooms" as const, title: r.name, text: `${r.english} — ${r.area} م²، ${r.adults} بالغ. ${r.bed}. ${r.features}`, source: r.source, note: r.note, tags: `${r.group} غرفة غرف غرفه جناح فلل ${r.english}` })),
  ...halls.map((h, i) => ({ id: `hall-${i}`, section: "halls" as const, title: `قاعة ${h.name}`, text: `حتى ${h.capacity} ضيف${h.layout ? `، بتوزيع ${h.layout}` : ""}.`, source: h.wedding ? "/wedding/" : "/meeting-events/", note: "تُراجع السعة حسب توزيع الجلوس وتجهيز المناسبة.", tags: `قاعه قاعة اجتماع مناسبات زفاف فرح ${h.english}` })),
  ...contacts.map((c, i) => ({ id: `contact-${i}`, section: "contacts" as const, title: c.name, text: [c.phone, c.extension ? `تحويلة ${c.extension} على 0112758888` : "", c.email].filter(Boolean).join(" • "), source: c.source, tags: "رقم اتصال تواصل هاتف تحويله تحويلة ايميل email phone" })),
];

export function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[\u064B-\u065F\u0670ـ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function searchFacts(query: string) {
  const stop = new Set(["كم", "هل", "يوجد", "في", "عندكم", "ابغى", "ابي", "عن", "ما", "هو", "هي", "متى", "متي", "وقت", "الفندق", "فندق", "وش", "ايش"]);
  const tokens = normalize(query).split(" ").filter(t => t && !stop.has(t));
  if (!tokens.length) return [];
  return searchableFacts.map(f => {
    const title = normalize(f.title);
    const haystack = normalize([f.title, f.text, f.tags, f.note, f.hours, f.extension].filter(Boolean).join(" "));
    let matched = 0;
    const score = tokens.reduce((sum, t) => { const hit = haystack.includes(t); if (hit) matched++; return sum + (title.includes(t) ? 4 : hit ? 1 : 0); }, 0);
    return { fact: f, score: score + (matched === tokens.length ? 10 : 0), matched };
  }).filter(x => x.matched > 0).sort((a, b) => b.score - a.score).map(x => x.fact);
}
