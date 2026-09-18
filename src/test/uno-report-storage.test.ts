import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, session } = vi.hoisted(() => ({ get: vi.fn(), session: vi.fn() }));
vi.mock("../../netlify/functions/_shared/storage", () => ({ getEnvironmentStore: () => ({ get }) }));
vi.mock("../../netlify/functions/_shared/security", async original => ({ ...await original<object>(), validateSession: session }));
import handleBookings from "../../netlify/functions/bookings";

const run = () => handleBookings(new Request("https://www.res-dashbord.com/.netlify/functions/bookings?view=summary"));
beforeEach(() => { get.mockReset(); session.mockReset(); session.mockResolvedValue({ role: "viewer" }); });
describe("UNO report storage integrity", () => {
  it("does not return a zero report when storage fails", async () => {
    get.mockRejectedValue(new Error("storage unavailable"));
    const response = await run();
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("summary");
  });
  it("rejects incomplete UNO storage instead of borrowing legacy metadata", async () => {
    get.mockImplementation(async key => key === "uno-data" ? [] : key === "stats" ? { updatedAt: "2026-09-01", sourceFormat: "csv" } : null);
    expect((await run()).status).toBe(500);
    expect(get.mock.calls.some(([key]) => key === "stats")).toBe(false);
  });
  it("reads a dedicated UNO report without depending on unrelated legacy records", async () => {
    get.mockImplementation(async key => {
      if (key === "uno-data") return [];
      if (key === "uno-stats") return { sourceFormat: "uno-live-api", updatedAt: "2026-09-18T00:00:00Z" };
      if (key === "site") return {};
      throw new Error("legacy storage unavailable");
    });
    const response = await run();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: { system: "UNO", kind: "saved" }, summary: { classifiedTotal: 0 } });
  });
  it("does not admit a generic CSV as an UNO report", async () => {
    get.mockImplementation(async key => key === "stats" ? { sourceFormat: "csv" } : key === "data" ? [{ "Booking Status": "N" }] : null);
    const response = await run();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ summary: { classifiedTotal: 0 } });
  });
  it("rejects an unauthenticated request before reading reports", async () => {
    session.mockResolvedValue(null);
    expect((await run()).status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });
});
