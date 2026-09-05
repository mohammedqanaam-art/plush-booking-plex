import { describe, expect, it } from "vitest";
import type { CallCenterForecastReport } from "@/lib/callCenterForecast";
import {
  normalizeAvayaRoutingIdentifier,
  resolveCallCenterForecastScope,
} from "@/lib/callCenterForecastScope";
import type { CallCenterProject } from "@/lib/employeeWorkspaceTypes";

const employee = {
  answeredCalls: 95,
  missedCalls: 5,
  avgRingingSeconds: 7,
  loggedInDurationSeconds: 8 * 3_600,
  dndDurationSeconds: 20 * 60,
  hasInbound: true,
  hasDnd: true,
  hasTimecard: true,
};

const report = (
  reportId: string,
  routingScope?: CallCenterForecastReport["routingScope"],
): CallCenterForecastReport => ({
  reportId,
  from: "2026-08-01",
  to: "2026-08-01",
  syncedAt: "2026-08-01T18:00:00.000Z",
  employees: [employee],
  ...(routingScope ? { routingScope } : {}),
});
const project = (
  mapping?: CallCenterProject["avayaForecastMapping"],
): CallCenterProject => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "مشروع المصرف",
  clientName: "مصرف تجريبي",
  industry: "banking",
  channels: ["voice"],
  serviceLevelSeconds: 20,
  targetAnswerRate: 0.8,
  operatingHours: "24/7",
  status: "pilot",
  assignedEmployees: [],
  assignedUserIds: [],
  enabledToolIds: [],
  avayaForecastMapping: mapping,
  notes: "",
  createdBy: "Admin",
  updatedBy: "Admin",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

describe("call center forecast scope", () => {
  it("uses narrow canonical machine identifiers", () => {
    expect(normalizeAvayaRoutingIdentifier(" QUEUE-101 ")).toBe("queue-101");
    expect(normalizeAvayaRoutingIdentifier("Queue Main")).toBe("");
    expect(normalizeAvayaRoutingIdentifier("<script>")).toBe("");
  });

  it("keeps the overall view on unscoped reports and never mixes routed feeds", () => {
    const total = report("total");
    const routed = report("queue", { kind: "queue", identifier: "queue-101", provenance: "avaya-report" });
    const result = resolveCallCenterForecastScope([total, routed], [project()], { kind: "overall" });

    expect(result.reports.map((item) => item.reportId)).toEqual(["total"]);
    expect(result.metadata).toMatchObject({ status: "overall", matchedReports: 1, availableReports: 2 });
  });

  it("never substitutes an unscoped employee report for a project mapping", () => {
    const result = resolveCallCenterForecastScope(
      [report("employee-total")],
      [project({ routingKind: "queue", identifiers: ["queue-101"] })],
      { kind: "project", projectId: "11111111-1111-4111-8111-111111111111" },
    );

    expect(result.reports).toEqual([]);
    expect(result.metadata.status).toBe("no-matched-data");
    expect(result.metadata.message).toContain("لم تُستخدم التقارير الإجمالية كبديل");
  });

  it("matches only a report-proven Queue or Skill identity authorized by the project", () => {
    const reports = [
      report("total"),
      report("queue-101", { kind: "queue", identifier: "QUEUE-101", provenance: "avaya-report" }),
      report("queue-102", { kind: "queue", identifier: "queue-102", provenance: "avaya-report" }),
      report("skill-101", { kind: "skill", identifier: "queue-101", provenance: "avaya-report" }),
      report("untrusted", { kind: "queue", identifier: "queue-101", provenance: "manual" } as never),
    ];
    const result = resolveCallCenterForecastScope(
      reports,
      [project({ routingKind: "queue", identifiers: ["queue-101"] })],
      { kind: "queue", projectId: "11111111-1111-4111-8111-111111111111", identifier: "QUEUE-101" },
    );

    expect(result.reports.map((item) => item.reportId)).toEqual(["queue-101"]);
    expect(result.metadata.status).toBe("matched");
  });

  it("requires a precise Queue or Skill choice when a project maps more than one identifier", () => {
    const projects = [project({ routingKind: "skill", identifiers: ["skill-1", "skill-2"] })];
    const reports = [report("skill-1", { kind: "skill", identifier: "skill-1", provenance: "avaya-report" })];

    const ambiguous = resolveCallCenterForecastScope(reports, projects, {
      kind: "project", projectId: "11111111-1111-4111-8111-111111111111",
    });
    const precise = resolveCallCenterForecastScope(reports, projects, {
      kind: "skill", projectId: "11111111-1111-4111-8111-111111111111", identifier: "skill-1",
    });

    expect(ambiguous.reports).toEqual([]);
    expect(ambiguous.metadata.status).toBe("selection-required");
    expect(precise.reports).toHaveLength(1);
    expect(precise.metadata.status).toBe("matched");
  });

  it("marks projects without an explicit routing mapping as unmapped", () => {
    const result = resolveCallCenterForecastScope(
      [report("total")],
      [project()],
      { kind: "project", projectId: "11111111-1111-4111-8111-111111111111" },
    );
    expect(result.metadata.status).toBe("project-unmapped");
    expect(result.metadata.options.some((option) => option.label.includes("بلا ربط Avaya"))).toBe(true);
  });
});
