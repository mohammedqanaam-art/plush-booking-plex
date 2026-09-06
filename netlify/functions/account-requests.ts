import type { Config } from "@netlify/functions";
import { accountId, accountStore, accountSummary, validateRegistration, type AccountRequest } from "./_shared/accountRequests";
import { hashPassword, json, requireSameOrigin, validateSession, type UserRole } from "./_shared/security";
import { getEncryptedEnvironmentStore } from "./_shared/storage";

export default async (req: Request) => {
  const originError = requireSameOrigin(req); if (originError) return originError;
  if (!["GET", "POST", "PATCH"].includes(req.method)) return json({ error: "Method not allowed" }, 405);
  const session = req.method === "POST" ? null : await validateSession(req);
  if (req.method !== "POST" && !session) return json({ error: "Unauthorized" }, 401);
  if (req.method !== "POST" && session?.role !== "superadmin") return json({ error: "المراجعة متاحة لمدير النظام فقط." }, 403);
  try {
    const store = accountStore();
    if (req.method === "GET") {
      const { blobs } = await store.list({ prefix: "account/" });
      const records = await Promise.all(blobs.map(({ key }) => store.get<AccountRequest>(key)));
      return json({ requests: records.filter(Boolean).map(accountSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "الطلب طويل جدًا." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ error: "طلب غير صحيح." }, 400); }
    if (!body || Array.isArray(body) || typeof body !== "object") return json({ error: "طلب غير صحيح." }, 400);
    if (req.method === "POST") {
      let fields: ReturnType<typeof validateRegistration>;
      try { fields = validateRegistration(body); } catch (e) { return json({ error: (e as Error).message }, 400); }
      const id = accountId(fields.email);
      const existing = await store.get<AccountRequest>(`account/${id}`);
      const legacyUsers = await getEncryptedEnvironmentStore("users", { consistency: "strong" }).get<Array<{ username: string }>>("all");
      const alreadyRegistered = Array.isArray(legacyUsers) && legacyUsers.some((user) => user.username.toLowerCase() === fields.email);
      // Repeated public requests cannot reset credentials or approval on an existing record.
      if (!existing && !alreadyRegistered) await store.setJSON(`account/${id}`, {
        id, email: fields.email, firstName: fields.firstName, lastName: fields.lastName, phone: fields.phone,
        passwordHash: hashPassword(fields.password), status: "pending", createdAt: new Date().toISOString(),
      } satisfies AccountRequest);
      return json({ ok: true, message: "تم رفع طلبكم لمدير النظام وسيتم المراجعة وتفعيل حسابكم." }, 202);
    }
    const id = typeof body.id === "string" ? body.id : "";
    const action = body.action;
    if (!/^[a-f0-9]{64}$/.test(id) || !["approve", "reject", "deactivate", "activate"].includes(String(action))) return json({ error: "قرار غير صحيح." }, 400);
    const record = await store.get<AccountRequest>(`account/${id}`);
    if (!record) return json({ error: "الطلب غير موجود." }, 404);
    const validTransition = ((action === "approve" || action === "reject") && record.status === "pending")
      || (action === "deactivate" && record.status === "approved") || (action === "activate" && record.status === "disabled");
    if (!validTransition) return json({ error: "حالة الحساب تغيرت. حدث القائمة ثم أعد المحاولة." }, 409);
    const role = (body.role || record.role || "viewer") as UserRole;
    if (!["viewer", "editor", "admin"].includes(role)) return json({ error: "الصلاحية غير صحيحة." }, 400);
    const updated: AccountRequest = { ...record, status: action === "deactivate" ? "disabled" : action === "reject" ? "rejected" : "approved",
      role: action === "reject" ? undefined : role, reviewedBy: session!.username, reviewedAt: new Date().toISOString() };
    await store.setJSON(`account/${id}`, updated);
    return json({ request: accountSummary(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = message.includes("DATA_ENCRYPTION_KEY") ? "CONFIGURATION_REQUIRED"
      : /locked|read.only|403/i.test(message) ? "STORAGE_LOCKED" : "STORAGE_UNAVAILABLE";
    console.error("[account-requests] storage unavailable", { code, operation: req.method });
    return json({ error: "تعذر حفظ أو تحميل الطلبات. أعد المحاولة.", code }, 503);
  }
};
export const config: Config = { path: "/api/account-requests", rateLimit: { windowLimit: 12, windowSize: 60, aggregateBy: ["ip"] } };
