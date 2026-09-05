import { beforeEach, describe, expect, it, vi } from "vitest";

const storageState = vi.hoisted(() => ({ records: new Map<string, unknown>() }));

vi.mock("../../netlify/functions/_shared/storage", () => ({
  getEncryptedEnvironmentStore: () => ({
    get: async (key: string) => storageState.records.get(key) ?? null,
    setJSON: async () => undefined,
    delete: async () => undefined,
    listPages: async function* (options: { prefix?: string } = {}) {
      const prefix = options.prefix || "";
      const keys = [...storageState.records.keys()].filter((key) => key.startsWith(prefix)).sort();
      for (let index = 0; index < keys.length; index += 100) {
        yield { blobs: keys.slice(index, index + 100).map((key) => ({ key })) };
      }
    },
  }),
}));

import { getEmployeeWorkspaceSnapshot } from "../../netlify/functions/_shared/employeeWorkspace";

const createdAt = "2026-09-05T08:00:00.000Z";

beforeEach(() => storageState.records.clear());

describe("employee workspace pagination and scoped limits", () => {
  it("filters every page by actor before applying feedback, task, and shift limits", async () => {
    for (let index = 0; index < 501; index += 1) {
      const suffix = String(index).padStart(4, "0");
      storageState.records.set(`tasks/a-${suffix}`, {
        id: `other-task-${suffix}`,
        projectId: null,
        title: "Other task",
        description: "",
        assignee: "Other Agent",
        status: "todo",
        priority: "medium",
        dueAt: null,
        source: "test",
        createdBy: "Other Agent",
        updatedBy: "Other Agent",
        createdAt,
        updatedAt: createdAt,
      });
      storageState.records.set(`shifts/a-${suffix}`, {
        id: `other-shift-${suffix}`,
        projectId: null,
        employeeName: "Other Agent",
        date: "2026-09-05",
        startTime: "08:00",
        endTime: "16:00",
        role: "Agent",
        notes: "",
        status: "planned",
        createdBy: "Other Agent",
        updatedBy: "Other Agent",
        createdAt,
        updatedAt: createdAt,
      });
    }
    for (let index = 0; index < 301; index += 1) {
      const suffix = String(index).padStart(4, "0");
      storageState.records.set(`quality-notes/a-${suffix}`, {
        id: `other-note-${suffix}`,
        employeeName: "Other Agent",
        category: "General",
        score: 80,
        note: "Other feedback",
        callReviewId: null,
        createdBy: "Supervisor",
        createdByUserId: "supervisor-id",
        subjectUserId: "other-agent-id",
        updatedBy: "Supervisor",
        createdAt,
        updatedAt: createdAt,
      });
    }

    storageState.records.set("tasks/z-target", {
      id: "target-task",
      projectId: null,
      title: "Target task",
      description: "",
      assignee: "Target Agent",
      status: "todo",
      priority: "high",
      dueAt: null,
      source: "test",
      createdBy: "Target Agent",
      updatedBy: "Target Agent",
      createdAt,
      updatedAt: createdAt,
    });
    storageState.records.set("shifts/z-target", {
      id: "target-shift",
      projectId: null,
      employeeName: "Target Agent",
      date: "2026-09-05",
      startTime: "08:00",
      endTime: "16:00",
      role: "Agent",
      notes: "",
      status: "planned",
      createdBy: "Target Agent",
      updatedBy: "Target Agent",
      createdAt,
      updatedAt: createdAt,
    });
    storageState.records.set("quality-notes/z-target", {
      id: "target-note",
      employeeName: "Target Agent",
      category: "General",
      score: 90,
      note: "Target feedback",
      callReviewId: null,
      createdBy: "Supervisor",
      createdByUserId: "supervisor-id",
      subjectUserId: "target-agent-id",
      updatedBy: "Supervisor",
      createdAt,
      updatedAt: createdAt,
    });

    const snapshot = await getEmployeeWorkspaceSnapshot("Target Agent", "own", "target-agent-id");

    expect(snapshot.tasks.map((task) => task.id)).toEqual(["target-task"]);
    expect(snapshot.shifts.map((shift) => shift.id)).toEqual(["target-shift"]);
    expect(snapshot.qualityNotes.map((note) => note.id)).toEqual(["target-note"]);
  });
});
