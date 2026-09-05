import type { Config } from "@netlify/functions";
import type { EmployeeWorkspaceResource } from "../../src/lib/employeeWorkspaceTypes";
import {
  createWorkspaceRecord,
  deleteWorkspaceRecord,
  getEmployeeWorkspaceSnapshot,
  updateWorkspaceRecord,
} from "./_shared/employeeWorkspace";
import { canonicalUsername, json, requireSameOrigin, validateSession } from "./_shared/security";
import { getStoredUserByUsername, listStoredUsers, type StoredUser } from "./_shared/userDirectory";

const editableRoles = new Set(["superadmin", "admin", "editor"]);
const deletableRoles = new Set(["superadmin", "admin"]);
const resources = new Set<EmployeeWorkspaceResource>(["tasks", "shifts", "qualityNotes", "callReviews", "marketingEngagements", "callCenterProjects"]);

export const resolveProjectAssignmentsFromUsers = (
  value: unknown,
  users: Array<Pick<StoredUser, "id" | "username">>,
) => {
  const requested = Array.isArray(value) ? value.slice(0, 100) : [];
  const byUsername = new Map(users.map((user) => [canonicalUsername(user.username), user]));
  const assigned = new Map<string, Pick<StoredUser, "id" | "username">>();
  for (const candidate of requested) {
    const canonical = canonicalUsername(String(candidate || "").slice(0, 120));
    if (!canonical) continue;
    const user = byUsername.get(canonical);
    if (!user?.id) throw new Error("INVALID_ASSIGNED_USER");
    if (!assigned.has(user.id)) assigned.set(user.id, user);
    if (assigned.size >= 50) break;
  }
  const resolved = [...assigned.values()];
  return {
    assignedEmployees: resolved.map((user) => user.username),
    assignedUserIds: resolved.map((user) => user.id),
  };
};

const resolveProjectAssignments = async (value: unknown) => (
  resolveProjectAssignmentsFromUsers(value, await listStoredUsers())
);

const readBody = async (req: Request) => {
  if (Number(req.headers.get("content-length") || 0) > 32 * 1024) throw new Error("REQUEST_TOO_LARGE");
  return await req.json() as Record<string, unknown>;
};

const errorResponse = (error: unknown) => {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (code === "REQUEST_TOO_LARGE") return json({ error: "Request too large" }, 413);
  if (code === "RECORD_NOT_FOUND") return json({ error: "Record not found" }, 404);
  if (["TASK_TITLE_REQUIRED", "SHIFT_TIME_REQUIRED", "QUALITY_NOTE_REQUIRED", "MARKETING_PROJECT_REQUIRED", "CALL_CENTER_PROJECT_REQUIRED", "INVALID_RECORD_ID", "INVALID_PROJECT_ID", "INVALID_RECORD_CHANGE", "INVALID_ASSIGNED_USER", "INVALID_SUBJECT_USER", "CONTRACT_REQUIRED_FOR_EXECUTION"].includes(code)) {
    return json({ error: code }, 400);
  }
  console.error("[employee-workspace] operation failed", { code });
  return json({ error: "تعذر تحديث مساحة عمل الموظفين." }, 500);
};

export default async (req: Request) => {
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  const canManageAll = deletableRoles.has(session.role);

  if (req.method === "GET") {
    try {
      const reviewScope = ["admin", "superadmin"].includes(session.role) ? "all" : "own";
      return json(await getEmployeeWorkspaceSnapshot(session.username, reviewScope, session.userId));
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (!["POST", "PATCH", "DELETE"].includes(req.method)) return json({ error: "Method not allowed" }, 405);
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  if (!editableRoles.has(session.role)) return json({ error: "Read-only account" }, 403);
  try {
    const body = await readBody(req);
    const resource = body.resource;
    if (!resources.has(resource as EmployeeWorkspaceResource)) return json({ error: "Invalid resource" }, 400);
    const typedResource = resource as EmployeeWorkspaceResource;
    if (typedResource === "callCenterProjects" && !canManageAll) return json({ error: "Admin required" }, 403);
    if (typedResource === "callReviews" && req.method !== "DELETE") return json({ error: "Unsupported resource operation" }, 405);
    if (req.method === "DELETE" && typedResource !== "marketingEngagements" && !deletableRoles.has(session.role)) {
      return json({ error: "Delete requires admin" }, 403);
    }

    if (req.method === "POST") {
      let value = body.value && typeof body.value === "object" && !Array.isArray(body.value)
        ? body.value as Record<string, unknown>
        : {};
      if (typedResource === "callCenterProjects") {
        value = { ...value, ...await resolveProjectAssignments(value.assignedEmployees) };
      }
      const employeeName = typedResource === "qualityNotes" && !canManageAll ? session.username : value.employeeName;
      const projectId = String(value.projectId || "").trim();
      if (projectId && !canManageAll && (typedResource === "tasks" || typedResource === "shifts")) {
        const visible = await getEmployeeWorkspaceSnapshot(session.username, "own", session.userId);
        if (!visible.callCenterProjects.some((project) => project.id === projectId)) {
          return json({ error: "Project access denied" }, 403);
        }
      }
      let subjectUserId: string | undefined;
      if (typedResource === "qualityNotes") {
        const subject = await getStoredUserByUsername(employeeName).catch(() => null);
        subjectUserId = subject?.id
          || (canonicalUsername(employeeName) === canonicalUsername(session.username) ? session.userId : undefined);
        if (!subjectUserId) throw new Error("INVALID_SUBJECT_USER");
      }
      return json({
        record: await createWorkspaceRecord(
          typedResource,
          { ...value, employeeName, ...(subjectUserId ? { subjectUserId } : {}) },
          session.username,
          session.userId,
        ),
      }, 201);
    }

    const id = String(body.id || "");
    if (req.method === "PATCH") {
      if (typedResource !== "tasks" && typedResource !== "shifts" && typedResource !== "marketingEngagements" && typedResource !== "callCenterProjects") {
        return json({ error: "Unsupported resource operation" }, 405);
      }
      if (!canManageAll && (typedResource === "tasks" || typedResource === "shifts")) {
        const visible = await getEmployeeWorkspaceSnapshot(session.username, "own", session.userId);
        const records = typedResource === "tasks" ? visible.tasks : visible.shifts;
        if (!records.some((record) => record.id === id)) return json({ error: "Record not found" }, 404);
      }
      let changes = body.changes && typeof body.changes === "object" && !Array.isArray(body.changes)
        ? body.changes as Record<string, unknown>
        : {};
      if (typedResource === "callCenterProjects") {
        if (changes.assignedUserIds !== undefined && changes.assignedEmployees === undefined) {
          throw new Error("INVALID_ASSIGNED_USER");
        }
        if (changes.assignedEmployees !== undefined) {
          changes = { ...changes, ...await resolveProjectAssignments(changes.assignedEmployees) };
        }
      }
      return json({
        record: await updateWorkspaceRecord(typedResource, id, changes, session.username, session.userId),
      });
    }

    await deleteWorkspaceRecord(typedResource, id, session.username, session.userId);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid request body" }, 400);
    return errorResponse(error);
  }
};

export const config: Config = {
  path: "/api/employee/workspace",
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip"] },
};
