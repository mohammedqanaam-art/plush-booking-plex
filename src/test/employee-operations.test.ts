import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { memory, session } = vi.hoisted(() => ({ memory: new Map<string, unknown>(), session: vi.fn() }));
vi.mock("../../netlify/functions/_shared/storage", () => ({ getPrivateRecordStore: (name: string) => ({
  get: async (key: string) => memory.get(`${name}:${key}`) || null,
  setJSON: async (key: string, value: unknown) => { memory.set(`${name}:${key}`, structuredClone(value)); },
  list: async ({ prefix = "" } = {}) => ({ blobs: [...memory.keys()].filter((key) => key.startsWith(`${name}:${prefix}`)).map((key) => ({ key: key.slice(name.length + 1) })) }),
}) }));
vi.mock("../../netlify/functions/_shared/security", async (original) => ({ ...await original<object>(), validateSession: session }));
import handler from "../../netlify/functions/employee-operations";
import { createOperation, operationsAnswer, riyadhToday } from "../../netlify/functions/_shared/employeeOperations";
import { accountId } from "../../netlify/functions/_shared/accountRequests";
import { localAssistantReply } from "@/lib/visitorAssistantClient";
import type { Session } from "../../netlify/functions/_shared/security";
const employee: Session = { username: "agent@example.com", role: "viewer", createdAt: 1, expiresAt: Date.now() + 60000 };
const supervisor: Session = { ...employee, username: "A", role: "admin" };
const req = (body?: object, method = "POST") => new Request("https://www.res-dashbord.com/api/employee/operations", { method, headers: { "content-type": "application/json", origin: "https://www.res-dashbord.com" }, body: body ? JSON.stringify(body) : undefined });
const draft = { kind: "feedback", subject: "اقتراح لتحسين المكالمة", details: "توضيح خطوة التحقق للموظف" };
const available = () => ({ action: "availability", branchId: "braira-olaya", serviceDate: riyadhToday(), status: "available", fromTime: "10:00", reference: "تأكيد موظف الاستقبال", validMinutes: 30 });
describe("employee workflow permissions and data", () => {
  beforeEach(() => { memory.clear(); vi.clearAllMocks(); session.mockResolvedValue(employee); });
  afterEach(() => vi.useRealTimers());
  it("requires authentication and does not expose the internal guide anonymously", async () => {
    session.mockResolvedValue(null);
    expect((await handler(req(undefined, "GET"))).status).toBe(401);
    expect((await handler(req(draft))).status).toBe(401);
  });
  it("sets owner and status on the server regardless of submitted privileges", async () => {
    const response = await handler(req({ ...draft, createdBy: "A", assignee: "A", status: "completed" }));
    expect(response.status).toBe(201);
    expect((await response.json()).record).toMatchObject({ createdBy: employee.username, assignee: employee.username, status: "open" });
  });
  it("shows employees only their records and assignments, while supervisors see all", async () => {
    await handler(req(draft));
    const privateRecord = createOperation(draft, { ...employee, username: "other" });
    memory.set(`employee-workflows:record/${privateRecord.id}`, privateRecord);
    const result = await (await handler(req(undefined, "GET"))).json();
    expect(result.records).toHaveLength(1);
    expect(result.guide.status).toContain("بانتظار الاعتماد");
    expect((await handler(req({ id: privateRecord.id, status: "completed", resolution: "تم" }, "PATCH"))).status).toBe(403);
    session.mockResolvedValue(supervisor);
    expect((await (await handler(req(undefined, "GET"))).json()).records).toHaveLength(2);
  });
  it("requires a documented outcome before closing", async () => {
    const { record } = await (await handler(req(draft))).json();
    expect((await handler(req({ id: record.id, status: "completed" }, "PATCH"))).status).toBe(400);
    expect((await handler(req({ id: record.id, status: "completed", resolution: "تمت مراجعة المقترح" }, "PATCH"))).status).toBe(200);
  });
  it("lets a supervisor assign an active account but rejects unknown assignees", async () => {
    session.mockResolvedValue(supervisor);
    const body = { ...draft, kind: "supervisor_request", assignee: employee.username };
    expect((await handler(req(body))).status).toBe(400);
    memory.set(`account-requests:account/${accountId(employee.username)}`, { email: employee.username, status: "approved" });
    const { record } = await (await handler(req(body))).json();
    expect(record.assignee).toBe(employee.username);
    session.mockResolvedValue(employee);
    expect((await (await handler(req(undefined, "GET"))).json()).records).toHaveLength(1);
    expect((await handler(req({ id: record.id, status: "completed", resolution: "تم التنفيذ" }, "PATCH"))).status).toBe(200);
  });
  it("prevents employees creating supervisor tasks or publishing availability", async () => {
    expect((await handler(req({ ...draft, kind: "supervisor_request" }))).status).toBe(403);
    expect((await handler(req(available()))).status).toBe(403);
  });
  it("requires a contact and follow-up time for leads", async () => {
    expect((await handler(req({ ...draft, kind: "lead" }))).status).toBe(400);
    const response = await handler(req({ ...draft, kind: "lead", guestName: "ضيف تجريبي", guestPhone: "0500000000", dueAt: new Date(Date.now() + 3600000).toISOString() }));
    expect(response.status).toBe(201);
    expect(await operationsAnswer("هل يوجد عملاء محتملون للحجز؟", employee)).toContain("1 فرصة مفتوحة");
    expect(await operationsAnswer("هل يوجد عملاء محتملون للحجز؟", { ...employee, username: "other" })).toContain("0 فرصة مفتوحة");
  });
  it("never infers early arrival availability from missing or stale data", async () => {
    const question = "هل يتوفر دخول مبكر في بريرا العليا اليوم؟";
    expect(await operationsAnswer(question, employee)).toContain("لا يوجد تأكيد حديث");
    session.mockResolvedValue(supervisor);
    const response = await handler(req(available()));
    expect(response.status).toBe(201);
    expect(await operationsAnswer(question, employee)).toContain("من 10:00");
    expect(await operationsAnswer("هل يتوفر الدخول المبكر في بريرا العليا اليوم؟", employee)).toContain("من 10:00");
    expect(await operationsAnswer(question, employee)).toContain("تأكيد استقبال");
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 31 * 60000);
    expect(await operationsAnswer(question, employee)).toContain("لا يوجد تأكيد حديث");
  });
  it("distinguishes an unavailable confirmation and asks for missing branch/date", async () => {
    session.mockResolvedValue(supervisor);
    await handler(req({ ...available(), status: "unavailable" }));
    expect(await operationsAnswer("هل يتوفر دخول مبكر في بريرا العليا اليوم؟", employee)).toContain("بعدم توفر");
    expect(await operationsAnswer("هل يتوفر دخول مبكر؟", employee)).toContain("اسم الفرع وتاريخ الوصول");
  });
  it("sends employee operational questions to the server and directs public users to sign in", () => {
    expect(localAssistantReply("ما طلبات المشرفين؟", [], true)).toBeNull();
    expect(localAssistantReply("ما طلبات المشرفين؟", [])).toContain("سجل دخولك");
    expect(localAssistantReply("2000 خصم 20", [], true)).toContain("1600.00");
    expect(localAssistantReply("ما سياسة الدخول المبكر في بودل؟", [])).toBeNull();
  });
});
