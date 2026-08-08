import { describe, expect, it } from "vitest";
import {
  buildNightCoverage,
  filterMissedCalls,
  parseAbandonedCallsPages,
  projectedCoverageEnd,
  type AbandonedCallsReport,
} from "@/lib/shiftStartTools";
import type { DurationEntry } from "@/lib/avayaReportProcessor";

const timecardEntry = (patch: Partial<DurationEntry>): DurationEntry => ({
  key: "id:1",
  employeeId: "1",
  name: "Agent(1)",
  seconds: 3600,
  events: 1,
  shiftStartTimestamp: Date.UTC(2026, 7, 7, 21, 0, 0),
  shiftEndTimestamp: null,
  disconnectedDurationSeconds: 0,
  hasOpenSession: true,
  ...patch,
});

describe("shift start coverage", () => {
  it("projects an open 9-hour night shift and marks morning coverage green", () => {
    const entry = timecardEntry({ shiftStartTimestamp: Date.UTC(2026, 7, 7, 21, 58, 0) });
    const projected = projectedCoverageEnd(entry);
    expect(projected.kind).toBe("projected");
    expect(new Date(projected.timestamp!).getUTCHours()).toBe(6);
    expect(buildNightCoverage([entry])[0].status).toBe("morning");
  });

  it("keeps a late actual logout red and ignores daytime staff", () => {
    const late = timecardEntry({
      key: "id:2",
      hasOpenSession: false,
      shiftStartTimestamp: Date.UTC(2026, 7, 7, 13, 23),
      shiftEndTimestamp: Date.UTC(2026, 7, 7, 22, 10),
      seconds: 8 * 3600 + 46 * 60,
    });
    const daytime = timecardEntry({
      key: "id:3",
      hasOpenSession: false,
      shiftStartTimestamp: Date.UTC(2026, 7, 7, 8),
      shiftEndTimestamp: Date.UTC(2026, 7, 7, 17),
      seconds: 9 * 3600,
    });
    const result = buildNightCoverage([late, daytime]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("early");
    expect(result[0].coverageEndKind).toBe("actual");
  });
});

describe("Abandoned Calls filtering", () => {
  it("reads column positions and the graphical answered marker", () => {
    const report = parseAbandonedCallsPages([{
      width: 792,
      answeredYs: [299],
      items: [
        { text: "Abandoned Calls", x: 40, y: 550 },
        { text: "Friday, August 7, 2026 6:00:00 PM", x: 40, y: 530 },
        { text: "Friday, August 7, 2026 10:00:00 PM", x: 40, y: 520 },
        { text: "Call ID: 100", x: 40, y: 320 },
        { text: "HOTELBOUDL", x: 205, y: 320 },
        { text: "0501234567", x: 279, y: 320 },
        { text: "Queue", x: 509, y: 320 },
        { text: "07 Aug 2026", x: 584, y: 320 },
        { text: "18:03:56", x: 640.5, y: 320 },
        { text: "18:05:43", x: 680.5, y: 320 },
        { text: "0:01:47", x: 722.5, y: 320 },
        { text: "Call ID: 101", x: 40, y: 300 },
        { text: "BERIRA2024", x: 205, y: 300 },
        { text: "0557654321", x: 279, y: 300 },
        { text: "Ringing", x: 509, y: 300 },
        { text: "07 Aug 2026", x: 584, y: 300 },
        { text: "18:10:00", x: 640.5, y: 300 },
        { text: "18:10:40", x: 680.5, y: 300 },
        { text: "0:00:40", x: 722.5, y: 300 },
      ],
    }]);
    expect(report.calls).toHaveLength(2);
    expect(report.calls[0]).toMatchObject({ id: "100", externalParty: "0501234567", answered: false, durationSeconds: 107 });
    expect(report.calls[1].answered).toBe(true);
  });

  it("keeps FALSE, removes sub-30-second calls and de-duplicates Saudi phone formats", () => {
    const report: AbandonedCallsReport = {
      rangeStart: "start",
      rangeEnd: "end",
      calls: [
        { id: "1", internalParty: "A", externalParty: "0551234567", sourceEvent: "Queue", answered: false, date: "d", startTime: "1", endTime: "", duration: "0:01:00", durationSeconds: 60 },
        { id: "2", internalParty: "A", externalParty: "966551234567", sourceEvent: "Queue", answered: false, date: "d", startTime: "2", endTime: "", duration: "0:02:00", durationSeconds: 120 },
        { id: "3", internalParty: "A", externalParty: "0500000000", sourceEvent: "Queue", answered: false, date: "d", startTime: "3", endTime: "", duration: "0:00:20", durationSeconds: 20 },
        { id: "4", internalParty: "A", externalParty: "0500000001", sourceEvent: "Hold", answered: true, date: "d", startTime: "4", endTime: "", duration: "0:01:00", durationSeconds: 60 },
      ],
    };
    const result = filterMissedCalls(report, 30);
    expect(result.calls.map((call) => call.id)).toEqual(["1"]);
    expect(result.answeredRemoved).toBe(1);
    expect(result.shortRemoved).toBe(1);
    expect(result.duplicateRemoved).toBe(1);
  });
});
