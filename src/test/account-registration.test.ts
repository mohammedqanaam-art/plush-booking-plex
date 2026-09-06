import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { memory, session } = vi.hoisted(() => ({ memory: new Map<string, unknown>(), session: vi.fn() }));
vi.mock("../../netlify/functions/_shared/storage", () => ({ getEncryptedEnvironmentStore: (name: string) => ({
  get: async (key: string) => memory.get(`${name}:${key}`) || null,
  setJSON: async (key: string, value: unknown) => { memory.set(`${name}:${key}`, structuredClone(value)); },
  list: async ({ prefix = "" } = {}) => ({ blobs: [...memory.keys()].filter((key) => key.startsWith(`${name}:${prefix}`)).map((key) => ({ key: key.slice(name.length + 1) })) }),
}) }));
vi.mock("@netlify/blobs", () => ({ getStore: ({ name }: { name: string }) => ({ get: async (key: string) => memory.get(`${name}:${key}`) || null,
  setJSON: async (key: string, value: unknown) => { memory.set(`${name}:${key}`, value); } }) }));
vi.mock("../../netlify/functions/_shared/security", async (original) => ({ ...await original<object>(), validateSession: session }));
import handler from "../../netlify/functions/account-requests";
import auth from "../../netlify/functions/auth";
import users from "../../netlify/functions/users";
import { accountId, type AccountRequest } from "../../netlify/functions/_shared/accountRequests";
import { hashPassword, verifyPassword } from "../../netlify/functions/_shared/security";

const applicant = { email: "Agent@example.com", firstName: "محمد", lastName: "الدوسري", phone: "٠٥٠٠٠٠٠٠٠٠", password: "test-password-123" };
const req = (body?: object, method = "POST", origin = "https://www.res-dashbord.com") => new Request("https://www.res-dashbord.com/api/account-requests", { method, headers: { origin, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const admin = { username: "A", role: "superadmin", createdAt: 1, expiresAt: Date.now() + 60000 };
const record = () => memory.get(`account-requests:account/${accountId(applicant.email)}`) as AccountRequest;
describe("account registration and approval", () => {
  beforeEach(() => { memory.clear(); vi.clearAllMocks(); session.mockResolvedValue(null); vi.stubGlobal("Netlify", { env: { get: () => "" } }); });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps new accounts pending, hashes passwords and ignores requested privileges", async () => {
    const response = await handler(req({ ...applicant, role: "superadmin", status: "approved" }));
    expect(response.status).toBe(202);
    expect(record()).toMatchObject({ status: "pending", email: "agent@example.com", phone: "0500000000" });
    expect(record().role).toBeUndefined();
    expect(record().passwordHash).not.toContain(applicant.password);
    expect(verifyPassword(applicant.password, record().passwordHash)).toBe(true);
    expect(JSON.stringify(await response.json())).not.toContain("passwordHash");
  });
  it("allows login only after system-admin approval and returns the assigned role", async () => {
    await handler(req(applicant));
    expect((await auth(req({ username: "agent@example.com", password: applicant.password }))).status).toBe(401);
    session.mockResolvedValue(admin);
    expect((await handler(req({ id: record().id, action: "approve" }, "PATCH"))).status).toBe(200);
    const response = await auth(req({ username: "AGENT@example.com", password: applicant.password }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ username: "agent@example.com", role: "viewer" });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it.each([null, "viewer", "editor", "admin"])("does not permit %s to review requests", async (role) => {
    session.mockResolvedValue(role ? { ...admin, role } : null);
    expect((await handler(req(undefined, "GET"))).status).toBe(role ? 403 : 401);
    expect((await handler(req({ id: "a".repeat(64), action: "approve" }, "PATCH"))).status).toBe(role ? 403 : 401);
  });
  it("does not let repeat public submissions overwrite approval or password", async () => {
    await handler(req(applicant)); session.mockResolvedValue(admin);
    await handler(req({ id: record().id, action: "approve", role: "editor" }, "PATCH"));
    const saved = structuredClone(record());
    await handler(req({ ...applicant, password: "another-password-123" }));
    expect(record()).toEqual(saved);
    expect((await auth(req({ username: applicant.email, password: "another-password-123" }))).status).toBe(401);
  });
  it("preserves existing email accounts when someone submits a duplicate signup", async () => {
    memory.set("users:all", [{ username: "agent@example.com", role: "editor", passwordHash: hashPassword("existing-password-123") }]);
    expect((await handler(req(applicant))).status).toBe(202);
    expect(record()).toBeUndefined();
    const response = await auth(req({ username: "agent@example.com", password: "existing-password-123" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role: "editor" });
  });
  it("prevents a supervisor from granting the system-administrator role", async () => {
    session.mockResolvedValue({ ...admin, role: "admin" });
    expect((await users(req({ username: "new-admin", password: applicant.password, role: "superadmin" }))).status).toBe(403);
  });
  it("does not overwrite unreadable legacy users during administrator recovery login", async () => {
    memory.set("users:all", { unreadable: true });
    vi.stubGlobal("Netlify", { env: { get: (key: string) => key === "ADMIN_PASSWORD" ? "recovery-example-password" : key === "ADMIN_USERNAME" ? "A" : "" } });
    expect((await auth(req({ username: "A", password: "recovery-example-password" }))).status).toBe(503);
    expect(memory.get("users:all")).toEqual({ unreadable: true });
  });
  it("keeps rejected accounts blocked and removes password hashes from review responses", async () => {
    await handler(req(applicant)); session.mockResolvedValue(admin);
    await handler(req({ id: record().id, action: "reject" }, "PATCH"));
    expect((await auth(req({ username: applicant.email, password: applicant.password }))).status).toBe(401);
    const list = await handler(req(undefined, "GET"));
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await list.json())).not.toContain("passwordHash");
  });
  it.each([{ email: "bad" }, { firstName: "" }, { phone: "123" }, { password: "short" }])("validates %j before writing", async (fields) => {
    expect((await handler(req({ ...applicant, ...fields }))).status).toBe(400);
    expect(memory.size).toBe(0);
  });
  it("rejects foreign-origin registration", async () => {
    expect((await handler(req(applicant, "POST", "https://example.com"))).status).toBe(403);
    expect(memory.size).toBe(0);
  });
});
