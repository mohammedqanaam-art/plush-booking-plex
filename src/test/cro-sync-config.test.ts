import { describe, expect, it } from "vitest";
import {
  croDateRangeDays,
  croSyncNeedsRecovery,
  currentSaudiMonthRange,
  validCroSyncDateRange,
} from "../../netlify/functions/_shared/croSync";

describe("continuous CRO sync range", () => {
  it("uses the current Riyadh month and rolls forward without a stop date", () => {
    expect(currentSaudiMonthRange(new Date("2026-07-31T20:59:59Z"))).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(currentSaudiMonthRange(new Date("2026-07-31T21:00:00Z"))).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(currentSaudiMonthRange(new Date("2028-02-15T00:00:00Z"))).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("limits every CRO operation to one safe monthly batch", () => {
    expect(croDateRangeDays("2026-07-01", "2026-07-31")).toBe(31);
    expect(validCroSyncDateRange("2026-07-01", "2026-07-31")).toBe(true);
    expect(validCroSyncDateRange("2026-01-01", "2026-06-30")).toBe(false);
    expect(validCroSyncDateRange("2026-07-31", "2026-07-01")).toBe(false);
  });

  it("automatically releases oversized and expired active jobs", () => {
    expect(croSyncNeedsRecovery({
      state: "running",
      from: "2026-01-01",
      to: "2026-06-30",
      startedAt: "2026-07-28T10:00:00.000Z",
    }, Date.parse("2026-07-28T10:01:00.000Z"))).toBe(true);

    expect(croSyncNeedsRecovery({
      state: "running",
      from: "2026-07-01",
      to: "2026-07-31",
      startedAt: "2026-07-28T10:00:00.000Z",
    }, Date.parse("2026-07-28T10:17:00.000Z"))).toBe(true);

    expect(croSyncNeedsRecovery({
      state: "running",
      from: "2026-07-01",
      to: "2026-07-31",
      startedAt: "2026-07-28T10:00:00.000Z",
    }, Date.parse("2026-07-28T10:10:00.000Z"))).toBe(false);
  });
});
