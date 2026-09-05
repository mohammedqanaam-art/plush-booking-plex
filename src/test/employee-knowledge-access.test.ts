import { afterEach, describe, expect, it, vi } from "vitest";

const { readSession } = vi.hoisted(() => ({ readSession: vi.fn() }));
vi.mock("@netlify/blobs", () => ({ getStore: () => ({ get: readSession }) }));
import handler from "../../netlify/functions/employee-knowledge";

describe("operational knowledge server access", () => {
  afterEach(() => vi.resetAllMocks());

  it("returns no operational data without a valid cookie", async () => {
    const response = await handler(new Request("https://example.com/api/employee/knowledge"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(readSession).not.toHaveBeenCalled();
  });

  it("rejects an invented session token", async () => {
    readSession.mockResolvedValue(null);
    const response = await handler(new Request("https://example.com/api/employee/knowledge", {
      headers: { cookie: `__Host-res_admin_session=${"a".repeat(64)}` },
    }));
    expect(response.status).toBe(401);
  });

  it("loads data only for a validated server session and never caches it", async () => {
    readSession.mockResolvedValue({ username: "test-employee", role: "viewer", createdAt: Date.now(), expiresAt: Date.now() + 60_000 });
    const response = await handler(new Request("https://example.com/api/employee/knowledge", {
      headers: { cookie: `__Host-res_admin_session=${"b".repeat(64)}` },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    const body = await response.json();
    expect(body.branches.length).toBeGreaterThan(0);
    expect(body.branchRecords.length).toBeGreaterThan(0);
    expect(body.knowledgeEntries.length).toBeGreaterThan(0);
  });
});
