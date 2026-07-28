import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  isCroAutomationDue,
  type CroAutomationSettings,
} from "../../netlify/functions/_shared/croSync";

const settings = (patch: Partial<CroAutomationSettings> = {}): CroAutomationSettings => ({
  enabled: true,
  intervalMinutes: 60,
  mode: "rolling-month",
  ...patch,
});

describe("CRO automation control", () => {
  it("stops scheduled execution when the administrator disables it", () => {
    expect(isCroAutomationDue(settings({ enabled: false }))).toBe(false);
  });

  it("respects the configured interval on the 30-minute scheduler", () => {
    const lastTriggeredAt = "2026-07-28T00:00:00.000Z";
    expect(isCroAutomationDue(settings({ lastTriggeredAt }), Date.parse("2026-07-28T00:30:00.000Z"))).toBe(false);
    expect(isCroAutomationDue(settings({ lastTriggeredAt }), Date.parse("2026-07-28T01:00:00.000Z"))).toBe(true);
  });

  it("applies the master switch to scheduled and public sync routes", () => {
    const scheduled = fs.readFileSync("netlify/functions/cro-sync-scheduled.ts", "utf8");
    const publicRoute = fs.readFileSync("netlify/functions/cro-sync-public.ts", "utf8");
    const adminRoute = fs.readFileSync("netlify/functions/cro-sync.ts", "utf8");
    expect(scheduled).toContain("!automation.enabled");
    expect(publicRoute).toContain("!automation.enabled");
    expect(adminRoute).toContain('req.method === "PATCH"');
  });
});
