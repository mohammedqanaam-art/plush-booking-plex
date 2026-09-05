export const EMPLOYEE_AGENT_CATALOG = [
  {
    id: "reservation_matcher",
    name: "وكيل مطابقة الحجوزات",
    description: "يطابق UNO وPMS والهاتف واسم الضيف، ويعرض الفروقات وما يحتاج تصعيدًا.",
    badge: "UNO · OPERA",
    icon: "search",
  },
  {
    id: "call_compliance",
    name: "مستمع الإجراءات",
    description: "يستمع للتسجيل أو يقرأ النص ويدقق التحقق، الدقة، الوعود، الخصوصية والتوثيق.",
    badge: "صوت · امتثال",
    icon: "headphones",
    supportsAudio: true,
  },
  {
    id: "call_experience",
    name: "مستمع تجربة الضيف",
    description: "يقيم الترحيب والإنصات والتعاطف والوضوح وإغلاق المكالمة من منظور الضيف.",
    badge: "صوت · خدمة",
    icon: "heart",
    supportsAudio: true,
  },
  {
    id: "quality_coach",
    name: "مدرب الجودة",
    description: "يحوّل نتائج المكالمات وملاحظات المشرف إلى نقاط تدريب وخطة تحسين قابلة للقياس.",
    badge: "QA · Coaching",
    icon: "award",
  },
  {
    id: "shift_scheduler",
    name: "منسق الشفت",
    description: "يرتب ساعات العمل والتغطية والاستراحات والتسليم بين الموظفين وفق القيود المدخلة.",
    badge: "جدولة · تغطية",
    icon: "calendar",
  },
  {
    id: "task_board",
    name: "مدير لوحة العمل",
    description: "ينظم الأعمال والمشاريع، ويبني خطط الاستشارات التسويقية وتسليماتها وفق نطاق العقد.",
    badge: "مهام · تسويق",
    icon: "tasks",
  },
  {
    id: "shift_director",
    name: "مدير الوردية الذكي",
    description: "يدير الوكلاء الستة ويجمع المشاريع والحجوزات والمكالمات والجودة والشفت والمهام في موجز واحد.",
    badge: "Orchestrator",
    icon: "sparkles",
  },
] as const;

export type EmployeeAgentDefinition = (typeof EMPLOYEE_AGENT_CATALOG)[number];
export type EmployeeAgentId = EmployeeAgentDefinition["id"];
export const EMPLOYEE_AGENT_IDS = EMPLOYEE_AGENT_CATALOG.map((agent) => agent.id);
const employeeAgentIdSet = new Set<string>(EMPLOYEE_AGENT_IDS);

export const isEmployeeAgentId = (value: unknown): value is EmployeeAgentId => (
  typeof value === "string" && employeeAgentIdSet.has(value)
);
