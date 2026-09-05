import { describe, expect, it } from "vitest";
import {
  isFeedbackVisibleToActor,
  isProjectAssignedToActor,
} from "../../netlify/functions/_shared/employeeWorkspace";
import { resolveProjectAssignmentsFromUsers } from "../../netlify/functions/employee-workspace";

describe("employee workspace visibility", () => {
  it("keeps canonical-name matching only for legacy projects without stable IDs", () => {
    const project = { assignedEmployees: ["  Agent   One ", "موظف اثنان"] };
    expect(isProjectAssignedToActor(project, "agent one", "new-account-id")).toBe(true);
    expect(isProjectAssignedToActor(project, "Agent Three", "agent-three-id")).toBe(false);
  });

  it("authorizes modern project assignments by stable user ID and never falls back to a matching name", () => {
    const project = {
      assignedEmployees: ["Agent One"],
      assignedUserIds: ["original-agent-id"],
    };
    expect(isProjectAssignedToActor(project, "Renamed Agent", "original-agent-id")).toBe(true);
    expect(isProjectAssignedToActor(project, "Agent One", "recreated-account-id")).toBe(false);
  });

  it("resolves free-form UI usernames into server-verified stable assignment IDs", () => {
    const users = [
      { id: "agent-one-id", username: "Agent One" },
      { id: "agent-two-id", username: "موظف اثنان" },
    ];
    expect(resolveProjectAssignmentsFromUsers([" agent   one ", "موظف اثنان", "AGENT ONE"], users)).toEqual({
      assignedEmployees: ["Agent One", "موظف اثنان"],
      assignedUserIds: ["agent-one-id", "agent-two-id"],
    });
    expect(() => resolveProjectAssignmentsFromUsers(["Unknown Account"], users)).toThrow("INVALID_ASSIGNED_USER");
  });

  it("shows supervisor feedback to its subject but not to an unrelated employee", () => {
    const feedback = {
      employeeName: "Agent One",
      createdBy: "Supervisor",
      createdByUserId: "supervisor-id",
      subjectUserId: "agent-one-id",
    };
    expect(isFeedbackVisibleToActor(feedback, "Agent One", "agent-one-id")).toBe(true);
    expect(isFeedbackVisibleToActor(feedback, "Agent Two", "agent-two-id")).toBe(false);
  });

  it("keeps legacy feedback visible when the subject name matches", () => {
    const legacyFeedback = {
      employeeName: "Agent One",
      createdBy: "Supervisor",
      createdByUserId: "supervisor-id",
    };
    expect(isFeedbackVisibleToActor(legacyFeedback, "agent one", "agent-one-id")).toBe(true);
  });

  it("does not use name or creator fallbacks when a different subject user ID is present", () => {
    const feedback = {
      employeeName: "Agent One",
      createdBy: "Agent One",
      createdByUserId: "agent-one-id",
      subjectUserId: "original-subject-id",
    };
    expect(isFeedbackVisibleToActor(feedback, "Agent One", "recreated-account-id")).toBe(false);
    expect(isFeedbackVisibleToActor(feedback, "Agent One", "agent-one-id")).toBe(false);
  });
});
