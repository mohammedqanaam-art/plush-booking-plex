import type { Config } from "@netlify/functions";
import { json, requireSameOrigin, validateSession } from "./_shared/security";
import { operationsGuide } from "./_shared/operationsGuide";
import { activeAvailability, createAvailability, createOperation, managesOperations, operationsStore, updateOperation, validAssignee, visibleOperations } from "./_shared/employeeOperations";
import type { OperationRecord } from "../../src/lib/operationsTypes";

export default async (req: Request) => {
  const session = await validateSession(req); if (!session) return json({ error: "Unauthorized" }, 401);
  const originError = requireSameOrigin(req); if (originError) return originError;
  try {
    if (req.method === "GET") return json({ guide: operationsGuide, records: await visibleOperations(session), availability: await activeAvailability(), canManage: managesOperations(session), username: session.username });
    if (!["POST", "PATCH"].includes(req.method)) return json({ error: "Method not allowed" }, 405);
    if (Number(req.headers.get("content-length") || 0) > 8192) return json({ error: "Request too large" }, 413);
    const raw = await req.text(); if (raw.length > 8192) return json({ error: "Request too large" }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ error: "طلب غير صحيح." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "طلب غير صحيح." }, 400);
    const store = operationsStore();
    if (req.method === "POST" && body.action === "availability") {
      if (!managesOperations(session)) return json({ error: "Forbidden" }, 403);
      let availability: ReturnType<typeof createAvailability>;
      try { availability = createAvailability(body, session); } catch (e) { return json({ error: (e as Error).message }, 400); }
      await store.setJSON(`availability/${availability.branchId}/${availability.serviceDate}`, availability);
      return json({ availability }, 201);
    }
    if (req.method === "POST") {
      if (body.kind === "supervisor_request" && !managesOperations(session)) return json({ error: "Forbidden" }, 403);
      let record: OperationRecord;
      try { record = createOperation(body, session); } catch (e) { return json({ error: (e as Error).message }, 400); }
      if (!await validAssignee(record.assignee, session)) return json({ error: "الحساب المكلف غير موجود أو لم يُفعّل بعد." }, 400);
      await store.setJSON(`record/${record.id}`, record); return json({ record }, 201);
    }
    if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id)) return json({ error: "معرف غير صحيح." }, 400);
    const record = await store.get<OperationRecord>(`record/${body.id}`);
    if (!record || (!managesOperations(session) && record.assignee !== session.username)) return json({ error: "لا تملك صلاحية تحديث هذا الطلب." }, 403);
    let updated: OperationRecord;
    try { updated = updateOperation(record, body, session); } catch (e) { return json({ error: (e as Error).message }, 400); }
    if (!await validAssignee(updated.assignee, session)) return json({ error: "الحساب المكلف غير موجود أو لم يُفعّل بعد." }, 400);
    await store.setJSON(`record/${record.id}`, updated); return json({ record: updated });
  } catch { return json({ error: "تعذر تحميل أو حفظ بيانات مساحة العمل. أعد المحاولة." }, 503); }
};
export const config: Config = { path: "/api/employee/operations", rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip"] } };
