import type { CallCenterIndustry } from "./employeeWorkspaceTypes";

export type CallCenterToolProfile = {
  id: string;
  name: string;
  purpose: string;
  approval: "automatic-read" | "employee" | "supervisor" | "company-only";
};

export type CallCenterIndustryProfile = {
  id: CallCenterIndustry;
  name: string;
  operatingFocus: string;
  guardrails: string[];
  tools: CallCenterToolProfile[];
};

export const CALL_CENTER_INDUSTRY_PROFILES: CallCenterIndustryProfile[] = [
  {
    id: "general",
    name: "شركات وخدمات عامة",
    operatingFocus: "إدارة الاستفسارات والطلبات والشكاوى وفق SLA موحد ومسار تصعيد واضح.",
    guardrails: ["التحقق من هوية العميل بالحد الأدنى", "توثيق سبب التحويل", "لا التزام مالي دون اعتماد"],
    tools: [
      { id: "crm-read", name: "بحث CRM للقراءة", purpose: "عرض ملف العميل والسجل المرتبط بالمكالمة", approval: "automatic-read" },
      { id: "case-create", name: "إنشاء تذكرة", purpose: "فتح حالة برقم تتبع وتحديد SLA", approval: "employee" },
      { id: "knowledge", name: "قاعدة المعرفة", purpose: "إجابة موثقة بإصدار وتاريخ", approval: "automatic-read" },
      { id: "escalation", name: "تصعيد المشرف", purpose: "تحويل الاستثناءات والالتزامات", approval: "supervisor" },
    ],
  },
  {
    id: "restaurant",
    name: "مطاعم وضيافة",
    operatingFocus: "حجوزات الفروع والطلبات والشكاوى مع أولوية سلامة الغذاء وتجربة الضيف.",
    guardrails: ["حساسية الطعام تصعيد فوري", "الأسعار والتوفر من المصدر الحالي", "لا تعويض دون اعتماد"],
    tools: [
      { id: "reservation", name: "مطابقة الحجز", purpose: "مطابقة محلية بالرقم أو الاسم والتاريخ", approval: "automatic-read" },
      { id: "branch-menu", name: "الفروع والقائمة", purpose: "عرض ساعات العمل والخدمات والأسعار المعتمدة", approval: "automatic-read" },
      { id: "allergy", name: "مسار حساسية الغذاء", purpose: "إيقاف التخمين والتصعيد للفرع المختص", approval: "supervisor" },
      { id: "guest-recovery", name: "استعادة تجربة الضيف", purpose: "اقتراح إجراء دون منح تعويض تلقائي", approval: "supervisor" },
    ],
  },
  {
    id: "technology",
    name: "شركات تقنية",
    operatingFocus: "فرز الأعطال، جمع الأدلة، ربط الحالة بحادث معروف، ثم التصعيد للفريق الفني.",
    guardrails: ["لا وصول عن بعد دون موافقة", "لا طلب لكلمات المرور أو الرموز", "ربط كل إجراء بتذكرة"],
    tools: [
      { id: "ticketing", name: "نظام التذاكر", purpose: "إنشاء وتحديث تذكرة وفق الأولوية", approval: "employee" },
      { id: "incident", name: "حالة الخدمات", purpose: "التحقق من الأعطال المعلنة", approval: "automatic-read" },
      { id: "diagnostics", name: "شجرة التشخيص", purpose: "جمع الإصدار والخطأ والخطوات المنفذة", approval: "employee" },
      { id: "remote-support", name: "دعم عن بعد", purpose: "بدء جلسة مصرح بها ومسجلة", approval: "company-only" },
    ],
  },
  {
    id: "banking",
    name: "مصارف وخدمات مالية",
    operatingFocus: "خدمة مقيدة بأقل صلاحية مع تحقق هوية رسمي وتصعيد فوري للاشتباه والاحتيال.",
    guardrails: ["لا تخزين لبطاقة أو CVV أو OTP", "أقل قدر من بيانات العميل", "كل تغيير مالي بموافقة نظامية"],
    tools: [
      { id: "identity-script", name: "دليل التحقق", purpose: "عرض خطوات التحقق المعتمدة دون كشف الإجابات", approval: "company-only" },
      { id: "account-read", name: "استعلام حساب للقراءة", purpose: "عرض حالة عامة بعد تحقق الهوية", approval: "company-only" },
      { id: "fraud", name: "بلاغ اشتباه واحتيال", purpose: "تجميد مسار الخدمة والتصعيد للفريق المعتمد", approval: "supervisor" },
      { id: "audit", name: "سجل تدقيق", purpose: "توثيق من فتح البيانات ومتى ولماذا", approval: "automatic-read" },
    ],
  },
  {
    id: "government",
    name: "قطاعات حكومية",
    operatingFocus: "إرشاد رسمي، تتبع الطلبات، وإتاحة الخدمة مع التزام السجلات والسياسات الحكومية.",
    guardrails: ["المعلومة من مصدر رسمي فقط", "عدم تغيير حالة طلب دون صلاحية", "تسجيل الموافقات والنفاذ"],
    tools: [
      { id: "eligibility", name: "دليل الأهلية", purpose: "عرض شروط الخدمة والإجراء الرسمي", approval: "automatic-read" },
      { id: "request-tracking", name: "تتبع الطلب", purpose: "عرض الحالة بعد التحقق المقرر", approval: "company-only" },
      { id: "accessibility", name: "خدمة الإتاحة", purpose: "مسارات مساعدة لكبار السن وذوي الإعاقة", approval: "employee" },
      { id: "official-escalation", name: "التصعيد الرسمي", purpose: "إحالة الحالة للجهة المالكة مع رقم مرجعي", approval: "supervisor" },
    ],
  },
];

export const callCenterProfileById = (id: CallCenterIndustry) => (
  CALL_CENTER_INDUSTRY_PROFILES.find((profile) => profile.id === id) || CALL_CENTER_INDUSTRY_PROFILES[0]
);
