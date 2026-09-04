import {
  getSheetHallContact,
  HOTEL_INFORMATION_SHEET_URL,
  sheetOperationalHotels,
} from "../../../src/data/sheetOperationalData";

export type EmployeeKnowledgeSource = { title: string; url: string; snippet?: string };

const normalize = (value: string) => value.toLowerCase()
  .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/نارسس/g, "نارسيس").replace(/قرطبه/g, "قرطبة").replace(/الحمرا\b/g, "الحمراء")
  .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();

const OPERATIONAL_GUIDE = `
مرجعية الحجز المركزي BHG (مسودة تشغيلية 3.0؛ آخر تعميم نافذ أعلى أولوية):
- يملك الموظف الحالة حتى اكتمال الإجراء أو تأكيد استلامها من مسؤول آخر؛ إرسال رسالة أو تحويل غير مؤكد لا يغلق الحالة.
- قبل الإفصاح أو التعديل: طابق اسم النزيل ورقم الجوال ثم رقم الحجز/التاريخ/نوع الغرفة. عند عدم التطابق أوقف الإفصاح وارفع للمشرف.
- الشكوى: استمع دون مقاطعة، اعتذر عن الإزعاج دون إقرار مسؤولية غير متحقق منها، لخّص الوقائع، تحقق من الأنظمة والمصدر والسداد والسياسة، نفذ ما داخل الصلاحية، ثم حدد الإجراء والمالك ووقت التحديث ووثّق النتيجة.
- تصعيد فوري: تهديد أو سلامة أو احتيال أو إفشاء بيانات أو تعطل شامل أو ضيف حاضر لا يجد حجزًا مؤكدًا. إلى المشرف فورًا ثم الجهة المختصة.
- تصعيد عاجل: اختلاف حجز مؤكد/سعر/PMS، مشكلة سداد، استثناء مالي، أو طلب التحدث للمشرف. إلى المشرف المناوب بملف مكتمل.
- خلال الوردية: متابعة غير عاجلة أو توضيح سياسة أو رسالة فرع؛ عيّن مالكًا ووقت متابعة وأغلقها بالنتيجة.
- ملف التصعيد الأدنى: رقم الحجز والفرع والمصدر؛ اسم النزيل ورقم التواصل والتواريخ؛ الوقائع؛ ما تم التحقق منه وما نُفذ؛ القرار المطلوب؛ وموعد التحديث المبلغ للضيف.
- OTA: التعديل والإلغاء والاسترداد عبر المنصة المصدرة. الشركات/الائتمان تحتاج تعميدًا. الاسترداد والخصم والترقية والإعفاء لا تُوعد قبل اعتماد الجهة المخولة.
- اختلاف UNO/CRO مع PMS: راجع النظامين ووثّق الرقم والحالة والسعر والوقت وصعّد قبل إعطاء نتيجة نهائية.
- لا تطلب بيانات البطاقة أو CVV أو OTP أو كلمة مرور، ولا تشارك بيانات الضيف خارج القنوات المعتمدة.
- صياغة الشكوى: «نعتذر لكم عن الإزعاج. سأراجع تفاصيل الحالة الآن، ثم أوضح لكم الإجراء التالي وموعد التحديث.»
`;

const WEDDING_PACKAGES = {
  "بودل": ["الذهبي: 585 ريال", "البلاتيني: 685 ريال"],
  "عابر": ["باقة عابر: 449 ريال"],
  "بريرا": ["الفضي: 649 ريال", "الذهبي: 949 ريال", "البلاتيني: 1,149 ريال"],
  "نارسيس": ["الفضي: 799 ريال", "الذهبي: 1,199 ريال", "البلاتيني: 1,499 ريال"],
} as const;

type WeddingBrand = keyof typeof WEDDING_PACKAGES;
const weddingBrand = (message: string, hotelName?: string): WeddingBrand | null => {
  const text = normalize(`${message} ${hotelName || ""}`);
  if (/نارسيس/.test(text)) return "نارسيس";
  if (/بريرا/.test(text)) return "بريرا";
  if (/عابر/.test(text)) return "عابر";
  if (/بودل/.test(text)) return "بودل";
  return null;
};

const branchMatch = (message: string) => {
  const query = normalize(message);
  return sheetOperationalHotels.map((hotel) => ({ hotel, key: normalize(hotel.name) }))
    .filter(({ key }) => {
      const withoutBrand = key.split(" ").slice(1).join(" ");
      return query.includes(key) || (withoutBrand.length >= 4 && query.includes(withoutBrand));
    }).sort((a, b) => b.key.length - a.key.length)[0]?.hotel;
};

const operationalSource: EmployeeKnowledgeSource = {
  title: "معلومات الفنادق — النسخة التشغيلية", url: HOTEL_INFORMATION_SHEET_URL,
  snippet: "بيانات الخدمات والأسعار التشغيلية؛ يلزم التحقق قبل الوعد للضيف لأن الأسعار قابلة للتغيير.",
};
const guideSource: EmployeeKnowledgeSource = {
  title: "الدليل التشغيلي لمكالمات الحجز المركزي BHG — مسودة 3.0", url: "/knowledge-bank",
  snippet: "مرجع إجراءات التحقق والتعامل مع الشكاوى والتصعيد وحدود الصلاحية.",
};

export const buildEmployeeKnowledge = (message: string) => {
  const hotel = branchMatch(message);
  const wedding = /عرسان|زفاف|honeymoon|wedding/i.test(message);
  const packageBrand = weddingBrand(message, hotel?.name);
  const complaint = /شكوى|شكوي|ضيف غاضب|تصعيد|complaint|escalat/i.test(message);
  const evidence: string[] = [];
  const sources: EmployeeKnowledgeSource[] = [];
  if (complaint) { evidence.push(OPERATIONAL_GUIDE); sources.push(guideSource); }
  if (hotel) {
    const hall = getSheetHallContact(hotel.name);
    evidence.push([`بيانات الفرع: ${hotel.name}`, `حالة توفر بكج العرسان في سجل الفرع: ${hotel.weddingPackage || "غير محدد"}`,
      `قاعة الاجتماعات/المناسبات: ${hotel.meetingHall || "غير محدد"}`, `الإفطار: ${hotel.breakfast || "غير محدد"}`,
      `المسبح: ${hotel.pool || "غير محدد"}`, `المطعم: ${hotel.restaurant || "غير محدد"}`,
      `مبيعات القاعات: ${hall?.phone || "غير متوفر في الملف"}`].join("\n"));
    sources.push(operationalSource);
  }
  let fastReply: string | null = null;
  if (wedding && packageBrand) {
    const hall = hotel ? getSheetHallContact(hotel.name) : undefined;
    const availability = hotel
      ? (/لا\s*يوجد|غير متوفر|^[-*]+$/i.test(hotel.weddingPackage || "") ? "غير مسجل كمتوفر في قائمة الفرع" : "مسجل كمتوفر في قائمة الفرع")
      : "يلزم تحديد الفرع للتحقق من التوفر";
    fastReply = [`باقات شهر العسل لعلامة ${packageBrand} (حسب بطاقة الأسعار الأحدث):`,
      ...WEDDING_PACKAGES[packageBrand].map((item) => `• ${item}`),
      hotel ? `\n${hotel.name}: ${availability}.` : "",
      hotel?.meetingHall ? `معلومة القاعة: ${hotel.meetingHall}.` : "",
      hall?.phone ? `تنسيق القاعات: ${hall.phone} (حسب وقت العمل المعتمد).` : "",
      "الأسعار واردة تحت بند الباقات + الضريبة في الملف. قبل تأكيدها للضيف تحقّق من الفرع أو الجهة المختصة من سريان العرض وتطبيقه على الفرع، ولا تعتمد أي سعر فرعي أقدم عند التعارض."]
      .filter(Boolean).join("\n\n");
  } else if (wedding && !hotel) {
    fastReply = "حدد اسم الفندق أو الفرع أولًا؛ أسعار وتفاصيل بكج العرسان تختلف بين الفروع، ولن أعطي سعرًا عامًا قد يكون غير صحيح.";
    sources.push(operationalSource);
  } else if (complaint && normalize(message).split(" ").length <= 9) {
    fastReply = ["الإجراء المختصر للشكوى", "1. استمع دون مقاطعة واعتذر عن الإزعاج دون إقرار مسؤولية قبل التحقق.",
      "2. طابق بيانات الضيف وحدد مصدر الحجز والفرع والتواريخ والسداد.", "3. راجع الوقائع في الأنظمة ونفّذ فقط ما يقع داخل صلاحيتك.",
      "4. صنّفها: فوري للسلامة/الاحتيال/إفشاء البيانات/ضيف حاضر بلا حجز؛ عاجل لاختلاف الحجز أو السعر أو السداد أو الاستثناء المالي؛ وغير العاجل يُتابع خلال الوردية.",
      "5. عند التصعيد أرسل ملفًا مكتملًا: رقم الحجز، الفرع، المصدر، بيانات التواصل، الوقائع، ما تم، القرار المطلوب وموعد تحديث الضيف.",
      "6. تبقى مالك الحالة حتى تأكيد الاستلام أو إغلاقها بنتيجة موثقة.",
      "\nصياغة مناسبة: «نعتذر لكم عن الإزعاج. سأراجع تفاصيل الحالة الآن، ثم أوضح لكم الإجراء التالي وموعد التحديث.»"].join("\n");
  }
  return { fastReply, evidence: evidence.join("\n\n"),
    sources: [...new Map(sources.map((source) => [source.url, source])).values()], hasLocalEvidence: evidence.length > 0 };
};

export const employeeGuideForModel = OPERATIONAL_GUIDE;
