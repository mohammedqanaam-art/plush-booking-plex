import { describe, expect, it } from "vitest";
import { buildCallCenterForecast, type CallCenterForecastReport } from "@/lib/callCenterForecast";

const report = (date: string, offered: number, missed = 5, overrides: Partial<CallCenterForecastReport["employees"][number]> = {}): CallCenterForecastReport => ({
  reportId: date,
  from: date,
  to: date,
  syncedAt: `${date}T18:00:00.000Z`,
  employees: [{
    answeredCalls: offered - missed,
    missedCalls: missed,
    avgRingingSeconds: 7,
    loggedInDurationSeconds: 8 * 3_600,
    dndDurationSeconds: 20 * 60,
    disconnectedDurationSeconds: 0,
    reconnectionCount: 0,
    hasInbound: true,
    hasDnd: true,
    hasTimecard: true,
    ...overrides,
  }],
});
describe("call center forecast", () => {
  it("refuses to fabricate a forecast without seven daily reports", () => {
    const result = buildCallCenterForecast([
      report("2026-08-01", 100),
      { ...report("2026-08-02", 200), to: "2026-08-08" },
    ], new Date("2026-08-03T00:00:00Z"));
    expect(result.status).toBe("insufficient");
    expect(result.forecast).toEqual([]);
    expect(result.sampleDays).toBe(1);
    expect(result.excludedReports).toBe(1);
  });

  it("deduplicates a day using the latest synced report", () => {
    const old = report("2026-08-01", 100);
    const current = { ...report("2026-08-01", 150), syncedAt: "2026-08-01T20:00:00.000Z" };
    const result = buildCallCenterForecast([old, current]);
    expect(result.latest?.offered).toBe(150);
    expect(result.sampleDays).toBe(1);
  });

  it("creates a bounded seven-day forecast from source-backed daily history", () => {
    const reports = Array.from({ length: 21 }, (_, index) => report(
      new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10),
      100 + index * 2,
      5 + Math.floor(index / 7),
    ));
    const result = buildCallCenterForecast(reports, new Date("2026-08-22T00:00:00Z"));
    expect(result.status).toBe("ready");
    expect(result.confidence).toBe("medium");
    expect(result.forecast).toHaveLength(7);
    result.forecast.forEach((point) => {
      expect(point.lowerOffered).toBeLessThanOrEqual(point.predictedOffered);
      expect(point.upperOffered).toBeGreaterThanOrEqual(point.predictedOffered);
      expect(point.predictedMissedProxyRate).toBeGreaterThanOrEqual(0);
      expect(point.predictedMissedProxyRate).toBeLessThanOrEqual(1);
    });
  });

  it("explains workload, coverage, DND and connectivity signals without claiming causality", () => {
    const reports = Array.from({ length: 7 }, (_, index) => report(
      new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10),
      index === 6 ? 180 : 100,
      index === 6 ? 30 : 5,
      index === 6 ? {
        loggedInDurationSeconds: 5 * 3_600,
        dndDurationSeconds: 2 * 3_600,
        avgRingingSeconds: 14,
        disconnectedDurationSeconds: 30 * 60,
        reconnectionCount: 6,
      } : {},
    ));
    const result = buildCallCenterForecast(reports);
    const ids = result.drivers.map((driver) => driver.id);
    expect(ids).toContain("volume");
    expect(ids).toContain("coverage");
    expect(ids).toContain("dnd");
    expect(ids).toContain("ringing");
    expect(ids).toContain("connectivity");
    expect(result.definitions.missedProxy).toContain("ليس Queue Abandonment");
  });
});
