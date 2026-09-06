import { randomUUID } from "node:crypto";
import { publicBranches } from "../../../src/data/publicBranches";
import { operationKinds, operationStatuses, isOperationsQuestion, type OperationRecord, type EarlyArrivalAvailability } from "../../../src/lib/operationsTypes";
import { getRegisteredAccount, normalizedPhone } from "./accountRequests";
import { getEncryptedEnvironmentStore } from "./storage";
import type { Session } from "./security";

export const operationsStore = () => getEncryptedEnvironmentStore("employee-workflows", { consistency: "strong" });
export const managesOperations = (session: Session) => ["superadmin", "admin"].includes(session.role);
export const canSeeOperation = (session: Session, record: OperationRecord) => managesOperations(session) || record.createdBy === session.username || record.assignee === session.username;
export const cleanField = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";
const accountName = (value: unknown) => { const name = cleanField(value, 120); return name.includes("@") ? name.toLowerCase() : name; };
export const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const validTime = (time: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
const knownBranch = (id: string) => publicBranches.some((branch) => branch.id === id);
export const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function validAssignee(username: string, session: Session) {
  if (username === session.username) return true;
  if (username.includes("@")) {
    const account = await getRegisteredAccount(username);
    if (account) return account.status === "approved";
  }
  const users = await getEncryptedEnvironmentStore("users", { consistency: "strong" }).get<Array<{ username: string }>>("all");
  return Array.isArray(users) && users.some((user) => user.username === username);
}

export function createOperation(body: Record<string, unknown>, session: Session): OperationRecord {
  const kind = cleanField(body.kind) as OperationRecord["kind"];
  if (!Object.hasOwn(operationKinds, kind)) throw new Error("اختر نوع الطلب.");
  if (kind === "supervisor_request" && !managesOperations(session)) throw new Error("الطلبات الإدارية الخاصة ينشئها المشرف فقط.");
  const subject = cleanField(body.subject, 140), details = cleanField(body.details, 2000);
  const branchId = cleanField(body.branchId), serviceDate = cleanField(body.serviceDate, 10), requestedTime = cleanField(body.requestedTime, 5);
  const guestName = cleanField(body.guestName, 100), guestPhone = normalizedPhone(cleanField(body.guestPhone, 30));
  const dueAt = cleanField(body.dueAt, 40), assignee = managesOperations(session) ? accountName(body.assignee) : session.username;
  if (!subject || !details) throw new Error("أدخل عنوان الطلب وتفاصيله.");
  if (branchId && !knownBranch(branchId)) throw new Error("الفرع غير صحيح.");
  if (serviceDate && !validDate(serviceDate)) throw new Error("تاريخ الوصول غير صحيح.");
  if (requestedTime && !validTime(requestedTime)) throw new Error("وقت الوصول غير صحيح.");
  if (dueAt && (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) < Date.now())) throw new Error("اختر موعد متابعة قادمًا.");
  if (guestPhone && !/^\+?\d{9,15}$/.test(guestPhone)) throw new Error("رقم التواصل غير صحيح.");
  if (kind === "early_checkin" && (!branchId || !serviceDate || !requestedTime)) throw new Error("حدد الفرع وتاريخ الوصول ووقته لطلب الدخول المبكر.");
  if (kind === "lead" && (!guestName || !guestPhone || !dueAt)) throw new Error("للعميل المحتمل أدخل الاسم والجوال وموعد المتابعة.");
  if (kind === "supervisor_request" && !assignee) throw new Error("حدد حساب الموظف المكلف بالطلب.");
  const now = new Date().toISOString();
  return { id: randomUUID(), kind, subject, details, branchId, serviceDate, requestedTime, guestName, guestPhone, dueAt,
    createdBy: session.username, assignee: assignee || session.username, status: "open", resolution: "", createdAt: now, updatedAt: now };
}

export function updateOperation(record: OperationRecord, body: Record<string, unknown>, session: Session): OperationRecord {
  if (!canSeeOperation(session, record) || (!managesOperations(session) && record.assignee !== session.username)) throw new Error("لا تملك صلاحية تحديث هذا الطلب.");
  const status = cleanField(body.status) as OperationRecord["status"];
  if (!Object.hasOwn(operationStatuses, status)) throw new Error("اختر حالة صحيحة.");
  const resolution = cleanField(body.resolution, 1500);
  if (["completed", "cancelled"].includes(status) && !resolution) throw new Error("وثّق النتيجة أو سبب الإلغاء قبل الإغلاق.");
  return { ...record, status, resolution, updatedAt: new Date().toISOString(),
    assignee: managesOperations(session) && typeof body.assignee === "string" ? accountName(body.assignee) || record.assignee : record.assignee };
}

export function createAvailability(body: Record<string, unknown>, session: Session): EarlyArrivalAvailability {
  if (!managesOperations(session)) throw new Error("تأكيد التوفر متاح للمشرف فقط.");
  const branchId = cleanField(body.branchId), serviceDate = cleanField(body.serviceDate, 10);
  const fromTime = cleanField(body.fromTime, 5), reference = cleanField(body.reference, 200), note = cleanField(body.note, 600);
  const minutes = Number(body.validMinutes), status = body.status as EarlyArrivalAvailability["status"];
  if (!knownBranch(branchId) || !validDate(serviceDate) || serviceDate < riyadhToday()) throw new Error("حدد الفرع وتاريخ وصول صحيحًا.");
  if (!validTime(fromTime) || !reference || !["available", "unavailable"].includes(status) || !Number.isInteger(minutes) || minutes < 5 || minutes > 120) throw new Error("أكمل وقت الدخول ومرجع تأكيد الاستقبال ومدة صلاحية بين 5 و120 دقيقة.");
  return { branchId, serviceDate, fromTime, status, reference, note, source: "branch_confirmation", verifiedBy: session.username,
    verifiedAt: new Date().toISOString(), validUntil: new Date(Date.now() + minutes * 60000).toISOString() };
}

export async function visibleOperations(session: Session) {
  const store = operationsStore();
  const { blobs } = await store.list({ prefix: "record/" });
  const records = await Promise.all(blobs.map(({ key }) => store.get<OperationRecord>(key)));
  return records.filter((record): record is OperationRecord => Boolean(record && canSeeOperation(session, record))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function activeAvailability() {
  const store = operationsStore();
  const { blobs } = await store.list({ prefix: "availability/" });
  const records = await Promise.all(blobs.map(({ key }) => store.get<EarlyArrivalAvailability>(key)));
  return records.filter((record): record is EarlyArrivalAvailability => Boolean(record && Date.parse(record.validUntil) > Date.now() && record.serviceDate >= riyadhToday()));
}
const normalized = (value: string) => value.replace(/[أإآ]/g, "ا").replace(/[\u064b-\u065f\u0670]/g, "").replace(/ة/g, "ه").replace(/\s+/g, " ");

export async function operationsAnswer(message: string, session: Session): Promise<string | null> {
  if (!isOperationsQuestion(message)) return null;
  if (/(?:دخول|وصول)\s*(?:ال)?مبكر/.test(message)) {
    const branches = publicBranches.filter((b) => normalized(message).includes(normalized(b.name)));
    const date = message.match(/\d{4}-\d{2}-\d{2}/)?.[0] || (/اليوم/.test(message) ? riyadhToday() : "");
    if (branches.length !== 1 || !validDate(date)) return "اذكر اسم الفرع وتاريخ الوصول، مثل: هل يتوفر دخول مبكر في بريرا العليا اليوم؟";
    const branch = branches[0];
    const record = (await activeAvailability()).find((r) => r.branchId === branch.id && r.serviceDate === date);
    if (!record) return `لا يوجد تأكيد حديث للدخول المبكر في ${branch.name} بتاريخ ${date}. اطلب التأكيد من الاستقبال عبر دليل الفروع أو سجل طلب دخول مبكر في مساحة العمل. مزامنة الحجوزات وحدها لا تثبت جاهزية الغرفة.`;
    const updated = new Date(record.verifiedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
    const expires = new Date(record.validUntil).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });
    return `${branch.name} بتاريخ ${date}: ${record.status === "available" ? `يوجد تأكيد من الاستقبال بإمكانية الدخول المبكر من ${record.fromTime}` : "آخر تأكيد من الاستقبال يفيد بعدم توفر الدخول المبكر"}.\nالمصدر: تأكيد استقبال راجعه المشرف، بتاريخ ${updated}، صالح حتى ${expires} بتوقيت الرياض.\n${record.note || "يراعى نوع الغرفة وسياسة الفرع عند تأكيد الحجز."}`;
  }
  const kind = /عميل|عملاء|العملاء/.test(message) ? "lead" : /طلباتي/.test(message) ? null : "supervisor_request";
  const records = (await visibleOperations(session)).filter((r) => (!kind || r.kind === kind) && ["open", "in_progress"].includes(r.status));
  return `${kind === "lead" ? "العملاء المحتملون" : kind ? "طلبات المشرفين" : "الطلبات"} في نطاق صلاحيتك: ${records.length} ${kind === "lead" ? "فرصة مفتوحة" : "طلب مفتوح"}.\n${records.slice(0, 5).map((r) => `• ${r.subject} — ${operationStatuses[r.status]}`).join("\n")}\nيمكنك مراجعة التفاصيل والمتابعة في مساحة العمل. هذه النتيجة تخص الطلبات المسجلة في اللوحة.`;
}
