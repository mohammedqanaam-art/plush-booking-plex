import { describe, expect, it } from "vitest";
import { EMPLOYEE_AGENT_CATALOG, EMPLOYEE_AGENT_IDS } from "@/lib/employeeAgents";

describe("employee agent catalog", () => {
  it("contains exactly seven unique operational agents", () => {
    expect(EMPLOYEE_AGENT_IDS).toHaveLength(7);
    expect(new Set(EMPLOYEE_AGENT_IDS).size).toBe(7);
    expect(EMPLOYEE_AGENT_CATALOG.map((agent) => agent.id)).toEqual([...EMPLOYEE_AGENT_IDS]);
  });

  it("assigns audio review to exactly two agents and keeps one director", () => {
    expect(EMPLOYEE_AGENT_CATALOG.filter((agent) => agent.supportsAudio).map((agent) => agent.id)).toEqual([
      "call_compliance",
      "call_experience",
    ]);
    expect(EMPLOYEE_AGENT_CATALOG.filter((agent) => agent.id === "shift_director")).toHaveLength(1);
  });
});
