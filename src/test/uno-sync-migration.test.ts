import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

describe("UNO-only live reservation synchronization", () => {
  it("deploys the UNO scheduler and no CRO synchronization functions", () => {
    const functionNames = readdirSync("netlify/functions");
    expect(functionNames).toContain("uno-sync-scheduled.ts");
    expect(functionNames.filter((name) => name.startsWith("cro-sync"))).toEqual([]);
    expect(functionNames).not.toContain("cro-export.ts");

    const scheduled = readFileSync("netlify/functions/uno-sync-scheduled.ts", "utf8");
    expect(scheduled).toContain('schedule: "*/30 * * * *"');
    expect(scheduled).toContain('action: "sync-system"');
  });

  it("redirects the retired CRO admin URL to UNO Voice", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const dashboard = readFileSync("src/pages/AdminDashboard.tsx", "utf8");
    expect(app).toContain('path="/admin/cro-export"');
    expect(app).toContain('<Navigate to="/admin/uno" replace />');
    expect(dashboard).toContain('to: "/admin/uno"');
    expect(dashboard).not.toContain("تحكم مزامنة CRO");
  });

  it("uses the requested UNO Voice reservations page", () => {
    const uno = readFileSync("netlify/functions/uno-connection.ts", "utf8");
    expect(uno).toContain("https://unolive-voice.rategain.com/view-reservations");
    expect(uno).toContain("brandId=3868248c-c053-43f2-b9c8-3188c74dfeb5");
    expect(uno).toContain("chainId=cdcc2737-a6b9-45bc-9d91-b1a760fb8026");
    expect(uno).not.toContain("https://unolive-voice.rategain.com/create-booking");
  });

  it("keeps the public report page read-only instead of starting CRO in the background", () => {
    const page = readFileSync("src/pages/BookingReports.tsx", "utf8");
    const client = readFileSync("src/lib/api.ts", "utf8");
    expect(page).toContain("تحديث العرض");
    expect(page).not.toContain("requestPublicBookingSync");
    expect(client).not.toContain("/api/reports/sync");
    expect(client).not.toContain("cro-export");
  });
});
