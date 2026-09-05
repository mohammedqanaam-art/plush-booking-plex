import type { Config } from "@netlify/functions";
import {
  createEmployeeWorkspaceBackup,
  listEmployeeWorkspaceBackups,
  restoreMissingEmployeeWorkspaceRecords,
} from "./_shared/employeeWorkspaceBackup";
import { json, requireSameOrigin, validateSession } from "./_shared/security";

export default async (req: Request) => {
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (session.role !== "superadmin") return json({ error: "Superadmin required" }, 403);
  if (req.method === "GET") return json({ backups: await listEmployeeWorkspaceBackups() });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  if (Number(req.headers.get("content-length") || 0) > 4 * 1024) return json({ error: "Request too large" }, 413);
  let body: { action?: unknown; snapshotId?: unknown; confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (body.action === "create") {
    if (body.confirm !== "CREATE_ENCRYPTED_SNAPSHOT") return json({ error: "Explicit snapshot confirmation required" }, 400);
    try {
      return json({ backup: await createEmployeeWorkspaceBackup() }, 201);
    } catch (error) {
      console.error("[employee-backups] snapshot failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
      return json({ error: "Snapshot failed" }, 500);
    }
  }
  if (body.action !== "restore" || body.confirm !== "RESTORE_MISSING_ONLY") {
    return json({ error: "Explicit restore confirmation required" }, 400);
  }
  try {
    return json(await restoreMissingEmployeeWorkspaceRecords(String(body.snapshotId || "")));
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "INVALID_SNAPSHOT_ID") return json({ error: code }, 400);
    if (code === "BACKUP_NOT_FOUND") return json({ error: code }, 404);
    console.error("[employee-backups] restore failed", { code });
    return json({ error: "Restore failed" }, 500);
  }
};

export const config: Config = {
  path: "/api/employee/backups",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip"] },
};
