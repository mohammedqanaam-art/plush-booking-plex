export const operationKinds = { feedback: "التغذية الراجعة", early_checkin: "طلب دخول مبكر", lead: "عميل محتمل", supervisor_request: "طلب إداري من المشرف" } as const;
export const operationStatuses = { open: "جديد", in_progress: "قيد المتابعة", completed: "مكتمل", cancelled: "ملغي" } as const;
export type OperationKind = keyof typeof operationKinds;
export type OperationStatus = keyof typeof operationStatuses;
export type OperationRecord = {
  id: string; kind: OperationKind; subject: string; details: string; branchId: string;
  serviceDate: string; requestedTime: string; guestName: string; guestPhone: string; dueAt: string;
  createdBy: string; assignee: string; status: OperationStatus; resolution: string;
  createdAt: string; updatedAt: string;
};
export type EarlyArrivalAvailability = {
  branchId: string; serviceDate: string; status: "available" | "unavailable";
  fromTime: string; note: string; verifiedAt: string; validUntil: string;
  source: "branch_confirmation"; verifiedBy: string; reference: string;
};
export type OperationsGuide = {
  title: string; version: string; status: string; governance: string;
  steps: Array<{ title: string; text: string }>;
  routes: Array<{ title: string; text: string }>;
  escalation: Array<{ level: string; cases: string; action: string }>;
  escalationFields: string[];
  cancellation: Array<{ source: string; action: string; limit: string }>;
  phrases: Array<{ title: string; text: string }>;
};
export type OperationsData = { records: OperationRecord[]; availability: EarlyArrivalAvailability[]; guide: OperationsGuide; canManage: boolean; username: string };
export const isOperationsQuestion = (text: string) => (/(?:دخول|وصول)\s*(?:ال)?مبكر/.test(text) && !/سياسة|سياسه|شروط/.test(text))
  || /عميل\s*محتمل|عملاء\s*محتمل|العملاء المحتمل|طلبات(?:ي|\s+(?:المشرف|إدار|ادار))/.test(text);
