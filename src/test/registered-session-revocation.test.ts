import { beforeEach, describe, expect, it, vi } from "vitest";
const { readSession, removeSession, readAccount } = vi.hoisted(() => ({ readSession: vi.fn(), removeSession: vi.fn(), readAccount: vi.fn() }));
vi.mock("@netlify/blobs", () => ({ getStore: () => ({ get: readSession, delete: removeSession }) }));
vi.mock("../../netlify/functions/_shared/accountRequests", () => ({ getRegisteredAccount: readAccount }));
import { validateSession } from "../../netlify/functions/_shared/security";

const request = () => new Request("https://www.res-dashbord.com/api/employee/operations", { headers: { cookie: `__Host-res_admin_session=${"a".repeat(64)}` } });
describe("registered account session revocation", () => {
  beforeEach(() => { vi.clearAllMocks(); readSession.mockResolvedValue({ username: "employee@example.com", role: "viewer", createdAt: Date.now() - 10000, expiresAt: Date.now() + 60000 }); removeSession.mockResolvedValue(undefined); });
  it("invalidates an existing session as soon as the account is disabled", async () => {
    readAccount.mockResolvedValue({ status: "disabled", role: "viewer" });
    expect(await validateSession(request())).toBeNull(); expect(removeSession).toHaveBeenCalled();
  });
  it("does not revive old sessions when the account is reactivated", async () => {
    readAccount.mockResolvedValue({ status: "approved", role: "viewer", reviewedAt: new Date().toISOString() });
    expect(await validateSession(request())).toBeNull();
  });
  it("accepts a session issued after the current approval", async () => {
    readAccount.mockResolvedValue({ status: "approved", role: "viewer", reviewedAt: new Date(Date.now() - 20000).toISOString() });
    expect(await validateSession(request())).toMatchObject({ username: "employee@example.com", role: "viewer" });
  });
  it("rejects obsolete privileges and fails closed when account validation fails", async () => {
    readAccount.mockResolvedValueOnce({ status: "approved", role: "editor" });
    expect(await validateSession(request())).toBeNull();
    readAccount.mockRejectedValueOnce(new Error("store unavailable"));
    expect(await validateSession(request())).toBeNull();
  });
});
