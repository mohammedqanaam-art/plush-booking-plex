import type { EmployeeAgentId } from "./employeeAgents";
import type {
  EmployeeCallReview,
  EmployeeWorkspaceResource,
  EmployeeWorkspaceSnapshot,
} from "./employeeWorkspaceTypes";
import type { CallCenterOperationsResponse } from "./callCenterOperations";
import type { CallCenterForecastScopeOption } from "./callCenterForecastScope";

export type BookingMatch = {
  score: number;
  unoNumber: string;
  pmsNumber: string;
  phoneLast4: string;
  guestName: string;
  agentName: string;
  property: string;
  city: string;
  status: string;
  checkIn: string;
  checkOut: string;
  bookingDate: string;
};

export type EmployeeBackupManifest = {
  snapshotId: string;
  createdAt: string;
  recordCount: number;
  mode: "same-provider-encrypted";
};

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
  return body;
};

const jsonHeaders = { "Content-Type": "application/json" };

export const employeeHub = {
  workspace: () => request<EmployeeWorkspaceSnapshot>("/api/employee/workspace"),

  callCenterOperations: (scope?: Pick<CallCenterForecastScopeOption, "kind" | "projectId" | "routingIdentifier">) => {
    const query = new URLSearchParams();
    if (scope?.projectId) query.set("projectId", scope.projectId);
    if (scope?.kind === "queue" || scope?.kind === "skill") {
      query.set("routingKind", scope.kind);
      if (scope.routingIdentifier) query.set("routingIdentifier", scope.routingIdentifier);
    }
    const suffix = query.size ? `?${query.toString()}` : "";
    return request<CallCenterOperationsResponse>(`/api/call-center/operations${suffix}`, { cache: "no-store" });
  },

  backups: () => request<{ backups: EmployeeBackupManifest[] }>("/api/employee/backups", { cache: "no-store" }),

  createBackup: () => request<{ backup: EmployeeBackupManifest }>("/api/employee/backups", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "create", confirm: "CREATE_ENCRYPTED_SNAPSHOT" }),
  }),

  restoreBackup: (snapshotId: string) => request<{ snapshotId: string; restored: number; existing: number }>("/api/employee/backups", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ action: "restore", snapshotId, confirm: "RESTORE_MISSING_ONLY" }),
  }),

  create: <T>(resource: EmployeeWorkspaceResource, value: Record<string, unknown>) => request<{ record: T }>(
    "/api/employee/workspace",
    { method: "POST", headers: jsonHeaders, body: JSON.stringify({ resource, value }) },
  ),

  update: <T>(resource: EmployeeWorkspaceResource, id: string, changes: Record<string, unknown>) => request<{ record: T }>(
    "/api/employee/workspace",
    { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ resource, id, changes }) },
  ),

  remove: (resource: EmployeeWorkspaceResource, id: string) => request<{ ok: true }>(
    "/api/employee/workspace",
    { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ resource, id }) },
  ),

  runAgent: (agentId: EmployeeAgentId, message: string, projectId?: string) => request<{
    model: string;
    reply: string;
    bookingMatches?: BookingMatch[];
  }>("/api/employee/agents", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ agentId, message, ...(projectId ? { projectId } : {}) }),
  }),

  reviewCall: (file: File, employeeName: string, supervisorNotes: string) => {
    const body = new FormData();
    body.append("file", file);
    body.append("employeeName", employeeName);
    body.append("supervisorNotes", supervisorNotes);
    body.append("authorized", "true");
    body.append("policyVersion", "call-review-v1");
    return request<{ review: EmployeeCallReview }>("/api/employee/call-review", { method: "POST", body });
  },
};
