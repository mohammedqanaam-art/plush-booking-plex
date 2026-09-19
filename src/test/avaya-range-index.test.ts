import { describe, expect, it } from "vitest";
import { normalizeAvayaReportRange } from "../../netlify/functions/avaya-sync";

describe("Avaya report range archive", () => {
  it("normalizes Avaya timestamps into date-input keys", () => {
    expect(normalizeAvayaReportRange({
      rangeStart: "Jul 27, 2026 12:00:00 AM",
      rangeEnd: "Jul 28, 2026 12:00:00 AM",
      employees: [],
    })).toEqual({ from: "2026-07-27", to: "2026-07-28" });
  });

  it("falls back to employee shift timestamps when report headers are unavailable", () => {
    expect(normalizeAvayaReportRange({
      rangeStart: "",
      rangeEnd: "",
      employees: [{
        shiftStartTimestamp: Date.UTC(2026, 6, 27, 18, 0, 0),
        shiftEndTimestamp: Date.UTC(2026, 6, 28, 3, 0, 0),
      }] as never,
    })).toEqual({ from: "2026-07-27", to: "2026-07-28" });
  });
});
