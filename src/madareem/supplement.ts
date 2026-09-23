import type { Fact } from "./data";

// Public hotel facts are separate from the suggested call-handling guidance below.
export const extraFacts: Fact[] = [
  { id: "wifi", section: "services", title: "الإنترنت والاتصال", text: "واي فاي مجاني، هاتف وتجهيزات لشحن الجوال.", source: "/services/", tags: "نت انترنت وايفاي wifi شاحن" },
  { id: "hospitality", section: "services", title: "ضيافة الشاي والقهوة", text: "مياه معبأة وشاي وقهوة وسكر مجانية؛ غلاية وتجهيزات قهوة للخدمة الذاتية.", source: "/faq/", tags: "قهوة شاي ماء مياه غلاية ماكينة" },
  { id: "housekeeping", section: "services", title: "العناية بالغرفة", text: "تهيئة مسائية للغرفة، خيارات وسائد ومستلزمات عناية وحمام.", source: "/services/", tags: "هاوس كيبنج تنظيف مخدة وسادة مستلزمات" },
  { id: "laundry", section: "services", title: "الغسيل والكي", text: "خدمة غسيل ملابس، ومكواة مع طاولة كي.", source: "/services/", note: "اسأل القسم عن مدة التنفيذ والسعر.", tags: "مغسلة كوي ملابس غسيل laundry iron" },
  { id: "luggage", section: "services", title: "الأمتعة والكونسيرج", text: "حفظ وحمل الأمتعة وخدمة كونسيرج.", source: "/services/", tags: "شنط حقائب امتعة أمتعة كونسيرج luggage concierge" },
  { id: "business", section: "services", title: "مركز الأعمال", text: "مركز أعمال وقاعات اجتماعات ضمن مرافق الفندق.", source: "/services/", note: "تُراجع خدمات الطباعة وتجهيزاتها ورسومها مع الفندق.", tags: "طباعة سكانر اجتماع عمل business printing" },
  { id: "safety", section: "services", title: "الأمان والخزنة", text: "خزنة وإنذار حريق وخدمات أمن على مدار الساعة.", source: "/services/", tags: "خزنة امن أمان سلامة safe security" },
  { id: "room-service", section: "services", title: "خدمة الطعام داخل الغرفة", text: "خدمة الغرف تعمل 24 ساعة.", source: "/services/", note: "القائمة والأسعار ومدة التوصيل تُراجع وقت الطلب.", tags: "روم سيرفس اكل وجبات توصيل منتصف الليل room service" },
  { id: "accessible-parking", section: "services", title: "مواقف وتجهيزات لذوي الإعاقة", text: "تذكر صفحة الجناح المهيأ مواقف مخصصة، وصولًا للكراسي المتحركة وتنبيهات حسية متعددة.", source: "/disability-suite/", tags: "مواقف ذوي الاحتياجات إعاقة كرسي متحرك" },
  { id: "accessible-equipment", section: "services", title: "المعدات المساعدة عند الطلب", text: "سرير طبي وكرسي حمام عند الطلب للجناح المهيأ.", source: "/disability-suite/", note: "تُثبت الحاجة مسبقًا ويؤكّد الفندق توافر التجهيز المطلوب.", tags: "سرير طبي كرسي حمام احتياجات خاصة مهيأ" },
  { id: "hall-equipment", section: "halls", title: "تجهيز القاعات", text: "تجهيزات سمعية وبصرية وفريق لتنسيق المناسبة من التحضير إلى التنفيذ.", source: "/meeting-events/", note: "حدّد عدد الميكروفونات والشاشات وطريقة الجلوس ضمن طلب عرض السعر.", tags: "بروجكتر شاشة ميكروفون صوت قاعة تجهيزات" },
  { id: "hall-types", section: "halls", title: "اختيار قاعة الاجتماع", text: "قاعات متوسطة للمؤتمرات، وصغيرة لورش العمل، وتنفيذية للاجتماعات الخاصة. السعات المنشورة تُعرض في الجدول.", source: "/meeting-events/", tags: "ورش مؤتمر اجتماعات تنفيذي" },
  { id: "buffet-style", section: "dining", title: "نوع البوفيه", text: "يقدّم تروبيكانا ومطعم مداريم أطباقًا محلية وعالمية ضمن البوفيه اليومي.", source: "/restaurant/", note: "اطلب تأكيد متطلبات الحساسية والحمية من المطعم قبل الوعد بتوفير صنف محدد.", tags: "حساسية طعام حمية بوفيه مأكولات أطباق" },
  { id: "cafe-choice", section: "dining", title: "اختيار الجلسة", text: "اللوبي للمشروبات والوجبات الخفيفة والاجتماع غير الرسمي، والجاردن لجلسة خارجية بين النخيل مع شاشة كبيرة.", source: "/restaurant/", tags: "جلسات خارجية قهوة لقاء اجتماع شاشة مباراة" },
  { id: "access-discount", section: "policies", title: "خصم ذوي الإعاقة المنشور", text: "تعلن صفحة الجناح المهيأ خصمًا 15% مع إبراز البطاقة عند الوصول.", source: "/disability-suite/", note: "تحقّق من أهلية الضيف وشروط السعر قبل تطبيق الخصم؛ لا يُعمّم على عروض أخرى.", tags: "خصم إعاقة بطاقة 15 بالمية" },
];

export const roomChecks: Record<string, string[]> = {
  king: ["تأكيد سرير كينج مقابل سريرين منفصلين.", "تحديد الإطلالة والتدخين حسب المتاح."],
  twin: ["تأكيد وجود سريرين منفصلين.", "سؤال الضيف عن أعمار الأطفال إن وجدوا."],
  deluxe: ["شرح فرق المساحة عن القياسية: 30.24 مقابل 23.94 م².", "تأكيد الإطلالة وخطة الوجبات."],
  vip: ["تأكيد رغبة الضيف في الجاكوزي.", "مراجعة متطلبات الدخول المبكر في يوم الوصول."],
  junior: ["عدم وصف حوض الاستحمام بأنه جاكوزي دون تأكيد.", "توضيح عدد النزلاء والسرير الإضافي عند الطلب."],
  executive: ["ذكر الجاكوزي ضمن المزايا المنشورة.", "تأكيد الإطلالة وتفضيل التدخين."],
  presidential: ["ذكر غرفة الملابس وإطلالة الحديقة.", "مراجعة السعة إذا كان مع الضيف أطفال أو مرافقون."],
  royal: ["تأكيد التكوين المنشور: كينج وسريران منفصلان.", "شرح وجود التراس والطعام والمعيشة والجاكوزي الداخلي والخارجي."],
  accessible: ["تحديد التجهيزات المطلوبة قبل التأكيد.", "تأكيد إقامة المرافق؛ السعة المنشورة بالغ واحد.", "مراجعة أهلية الخصم والبطاقة المطلوبة."],
  villa: ["توضيح وجود 3 غرف نوم وسعة 6 بالغين.", "التنبيه إلى أن إطلالة المسبح ليست مسبحًا خاصًا."],
  "pool-villa": ["تأكيد طلب فيلا بمسبح خاص بالاسم.", "الاستفسار عن الأطفال ومتطلبات السلامة مع الفندق.", "التحقق من التوافر الفعلي؛ عدد الفلل ليس مخزونًا متاحًا لحظيًا."],
};

export const protocols = [
  { id: "opening", title: "افتتاح المكالمة وتحديد الطلب", intro: "ابدأ باسم الفندق، ثم حدّد هدف الاتصال.", steps: ["حجز جديد، تعديل، استفسار أم متابعة؟", "حدّد لغة الضيف وطريقة التواصل المناسبة."], reply: "أهلًا وسهلًا بك في فندق مداريم بالرياض، معك [اسم الموظف]، كيف أقدر أخدمك؟", tags: "ترحيب بداية افتتاح بروتوكول اتصال" },
  { id: "new-booking", title: "جمع تفاصيل الحجز", intro: "اجمع البيانات التي تغيّر السعر والتوافر قبل تقديم العرض.", steps: ["تاريخ الدخول والخروج وعدد الوحدات.", "عدد البالغين وأعمار الأطفال لكل وحدة.", "الفئة، نوع السرير، الوجبات ووقت الوصول المتوقع."], reply: "يسعدني أراجع الخيارات المناسبة لك. ما تاريخ الدخول والخروج، وعدد البالغين وأعمار الأطفال؟", tags: "حجز جديد طلب تواريخ ليالي" },
  { id: "family", title: "العائلات واختيار الوحدة", intro: "قارن التكوين والسعة باحتياج الأسرة.", steps: ["فرّق بين عدد وحدات الحجز وعدد غرف النوم داخل الفيلا.", "لا تضف أطفالًا أو أسرّة تتجاوز السعة دون تأكيد الفندق.", "اسأل عن الحاجة إلى مطبخ أو مسبح خاص."], reply: "هل تفضّلون غرفًا مستقلة أم فيلا تضم غرف نوم وصالة؟ وهل تحتاجون مسبحًا خاصًا؟", tags: "عائلة عوائل فيلا غرف نوم اطفال" },
  { id: "quote", title: "تقديم السعر بوضوح", intro: "اعرض ما يشمله السعر وما يُحاسب عليه منفصلًا.", steps: ["تحقّق من سعر التواريخ المطلوبة في نظام الحجز.", "راجع الوجبات والضرائب والرسوم وخطة الإلغاء.", "لا تعتبر الحاسبة في الدليل عرض سعر معتمدًا."], reply: "سأوضح لك إجمالي الإقامة وما يشمله السعر وشروط الحجز قبل التأكيد.", tags: "عرض سعر ضريبة مبلغ اجمالي شامل" },
  { id: "arrival", title: "طلب دخول مبكر أو خروج متأخر", intro: "تعامل معه كطلب يحتاج تأكيدًا تشغيليًا.", steps: ["احصل على وقت الوصول أو المغادرة المطلوب.", "راجع إمكانية التنفيذ والرسوم مع الاستقبال.", "سجّل الطلب ولا تقدّمه كخدمة مضمونة مسبقًا."], reply: "أسجل لك الوقت المطلوب، وأراجع إمكانية توفيره والرسوم مع الاستقبال قبل التأكيد.", tags: "دخول مبكر خروج متأخر وصول" },
  { id: "special-needs", title: "احتياج خاص أو تجهيز مساعد", intro: "اسأل عن التجهيز المطلوب بما يحفظ خصوصية الضيف.", steps: ["حدّد الوصول بالكرسي المتحرك أو السرير الطبي أو كرسي الحمام.", "راجع إقامة المرافق والتجهيزات المتاحة.", "اطلب تأكيدًا من الفندق قبل ضمان الخدمة."], reply: "ما التجهيز الذي يساعد على راحتك أثناء الإقامة؟ سأراجع توافره مع القسم المختص.", tags: "إعاقة مهيأ سرير طبي احتياج خاص" },
  { id: "transfer-request", title: "تنسيق النقل من المطار", intro: "جهّز معلومات الرحلة لتسعير النقل وتنسيقه.", steps: ["رقم الرحلة والتاريخ والوقت وصالة الوصول.", "عدد الركاب والحقائب ورقم التواصل.", "تأكيد السعر ونقطة اللقاء وطريقة الدفع مع الفندق."], reply: "لتنسيق النقل، أحتاج بيانات الرحلة وعدد الركاب والحقائب، ثم أؤكد لك السعر والترتيبات.", tags: "طيران رحلة سائق مطار نقل" },
  { id: "event-request", title: "طلب اجتماع أو مناسبة", intro: "أرسل لقسم المناسبات طلبًا قابلًا للتسعير.", steps: ["التاريخ، مدة الفعالية وعدد الحضور.", "توزيع الجلوس والضيافة والمعدات المطلوبة.", "بيانات الجهة ورقم التواصل؛ التسعير من قسم المناسبات."], reply: "يسعدنا استقبال مناسبتكم. ما التاريخ وعدد الحضور ونوع الضيافة والتجهيزات المطلوبة؟", tags: "مؤتمر قاعات قاعة مناسبة اجتماع حفل" },
  { id: "cancellation-request", title: "طلب تعديل أو إلغاء", intro: "اربط الإجابة بالحجز المحدد وشروطه.", steps: ["رقم التأكيد وقناة الحجز وتواريخ الإقامة.", "قراءة شروط السعر والرسوم قبل التنفيذ.", "تأكيد الصلاحية والإجراء ثم تزويد الضيف بمرجع المتابعة."], reply: "أراجع شروط حجزك أولًا، ثم أوضح لك إمكانية التعديل أو الإلغاء وأي رسوم قبل اتخاذ الإجراء.", tags: "إلغاء تعديل كنسلة استرداد" },
  { id: "complaint", title: "استقبال شكوى ومتابعتها", intro: "استمع ودوّن المطلوب بوضوح دون وعد غير مخوّل.", steps: ["تحديد المشكلة ووقت حدوثها ورقم الحجز عند الحاجة.", "تلخيص طلب الضيف ورفعه للقسم المسؤول.", "تثبيت قناة المتابعة؛ أي تعويض يحتاج موافقة صاحب الصلاحية."], reply: "أعتذر عن التجربة التي واجهتك. سأوثّق ملاحظتك وأتابعها مع القسم المختص، ما أفضل وسيلة للتواصل معك؟", tags: "شكوى تصعيد مشكلة تعويض مدير مناوب" },
  { id: "confirmation", title: "مراجعة التأكيد مع الضيف", intro: "أعد قراءة عناصر الحجز قبل إنهاء المكالمة.", steps: ["الاسم والتواريخ والفئة وعدد الوحدات والنزلاء.", "الإجمالي والوجبات والدفع وشروط الإلغاء.", "رقم التأكيد والطلبات الخاصة التي تم تأكيدها بالفعل."], reply: "للتأكد من صحة التفاصيل، أراجع معك التواريخ ونوع الإقامة والمبلغ والشروط ورقم التأكيد.", tags: "تأكيد تلخيص انهاء اغلاق مكالمة" },
  { id: "not-published", title: "عندما لا تتوفر معلومة مؤكدة", intro: "المعلومة غير المنشورة تحتاج مراجعة، لا تخمينًا.", steps: ["حدّد السؤال بدقة والجهة القادرة على الإجابة.", "راجع دليل الاتصال ثم تحقّق من القسم.", "ارجع للضيف بإجابة واضحة، ولا تعد بوقت متابعة غير متفق عليه."], reply: "حرصًا على إعطائك معلومة دقيقة، سأتحقق من هذه النقطة مع القسم المختص.", tags: "غير معروف لا اعرف غير منشور تأكيد معلومة" },
  { id: "unavailable", title: "عند عدم توافر الفئة المطلوبة", intro: "قدّم بديلًا مناسبًا بعد مراجعة التوافر الفعلي.", steps: ["تحقّق من التواريخ والفئة في نظام الحجز.", "اسأل عن مرونة التواريخ أو قبول فئة أخرى.", "اشرح فرق السعة والمواصفات والسعر قبل موافقة الضيف."], reply: "سأراجع لك فئة بديلة تناسب عدد الضيوف واحتياجك. هل تفضّل نفس التواريخ أم توجد مرونة في موعد الإقامة؟", tags: "فل كامل لا يوجد امكانية بديل غير متاح sold out availability" },
  { id: "price-objection", title: "مقارنة الأسعار والاعتراض على السعر", intro: "تأكّد أن المقارنة لنفس تفاصيل الإقامة.", steps: ["طابق التواريخ والفئة وعدد النزلاء والوجبات.", "راجع شمول الضرائب وشروط الدفع والإلغاء.", "راجع العروض المعتمدة دون وعد بمطابقة سعر أو خصم غير مخوّل."], reply: "يسعدني مراجعة الخيارات معك. لنتأكد أن العرضين لنفس الفئة والتواريخ وما يشمله السعر، ثم أتحقق من العروض المتاحة لك.", tags: "غالي ارخص سعر خصومات مقارنة عروض price discount" },
  { id: "booking-channel", title: "الحجز عبر منصة أو شركة", intro: "حدّد جهة إدارة الحجز قبل توجيه الضيف.", steps: ["اسأل عن اسم المنصة ورقم التأكيد.", "راجع إن كان المطلوب خدمة أثناء الإقامة أم تعديلًا على الحجز.", "تحقّق من صلاحية التعديل والقناة المسؤولة قبل توجيه الضيف."], reply: "ما المنصة التي تم الحجز من خلالها، وما رقم التأكيد؟ سأراجع طلبك والجهة المختصة بتنفيذه.", tags: "منصة شركة بوكينج تطبيق وسيط booking channel OTA" },
  { id: "hold", title: "الانتظار والتحويل إلى القسم", intro: "اشرح سبب الانتظار واحفظ تفاصيل الطلب.", steps: ["استأذن الضيف قبل وضع المكالمة على الانتظار.", "تأكّد من القسم الصحيح ووضّح ملخص الطلب عند التحويل.", "إذا تعذر الرد، اتفق على قناة متابعة دون وعد بوقت غير مؤكد."], reply: "هل تسمح لي بوضعك على الانتظار قليلًا للتحقق من القسم المختص؟ سأوضح لهم طلبك لتسهيل خدمتك.", tags: "انتظار تحويل مكالمة تحويلات قسم hold transfer" },
];

export const englishReplies: Record<string, string> = {
  opening: "Welcome to Madareem Hotel in Riyadh. My name is [agent name]. How may I help you?",
  "new-booking": "I would be happy to check suitable options for you. What are your check-in and check-out dates, the number of adults, and the ages of any children?",
  family: "Would you prefer separate rooms or a villa with bedrooms and a living area? Would you need a private pool?",
  quote: "Before you confirm, I will explain the total cost of your stay, what is included, and the booking conditions.",
  arrival: "I will note your preferred time and check availability and any charges with reception before confirming.",
  "special-needs": "What facilities would help make your stay comfortable? I will check with the relevant department to confirm availability.",
  "transfer-request": "To arrange your transfer, may I have your flight details and the number of passengers and bags? I will then confirm the price and arrangements.",
  "event-request": "We would be pleased to host your event. What is the date, the number of attendees, and your catering and equipment requirements?",
  "cancellation-request": "I will first review your booking conditions, then explain the available amendment or cancellation options and any charges before taking action.",
  complaint: "I am sorry to hear about your experience. I will record your concerns and follow up with the relevant department. What is the best way to contact you?",
  confirmation: "To make sure everything is correct, let me review your dates, accommodation type, total amount, booking conditions, and confirmation number with you.",
  "not-published": "To give you accurate information, I will check this point with the relevant department.",
  unavailable: "I will check an alternative that suits your party and requirements. Would you prefer the same dates, or do you have some flexibility?",
  "price-objection": "I would be happy to review the options with you. Let us first check that both offers cover the same room type, dates, and inclusions, then I will check which offers apply to you.",
  "booking-channel": "Which platform did you book through, and what is your confirmation number? I will review your request and check which team can handle it.",
  hold: "May I place you on hold briefly while I check with the relevant department? I will explain your request to help them assist you.",
};
