import type { Config } from "@netlify/functions";
import {
  canonicalUsername,
  environmentAdminCredentialIdentity,
  hashPassword,
  json,
  requireSameOrigin,
  VALID_ROLES,
  validateSession,
  type UserRole,
} from "./_shared/security";
import {
  deleteStoredUser,
  getStoredUserByUsername,
  listStoredUsers,
  saveStoredUser,
} from "./_shared/userDirectory";

function hasPermission(role: string, action: string): boolean {
  const perms: Record<string, string[]> = {
    superadmin: ["view_users", "add_user", "delete_user"],
    admin: ["view_users", "add_user"],
    editor: [],
    viewer: [],
  };
  return perms[role]?.includes(action) ?? false;
}

export default async (req: Request) => {
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const method = req.method;
  if (["POST", "PATCH", "DELETE"].includes(method)) {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
  }

  if (method === "GET") {
    if (!hasPermission(session.role, "view_users")) {
      return json({ error: "Permission Denied" }, 403);
    }
    try {
      const users = await listStoredUsers();
      const safeUsers = users.map((u) => ({
        username: u.username,
        role: u.role,
      }));
      return json({ users: safeUsers });
    } catch {
      return json({ error: "Server error" }, 500);
    }
  }

  if (method === "POST") {
    if (!hasPermission(session.role, "add_user")) {
      return json({ error: "Permission Denied" }, 403);
    }

    let body: { username?: string; password?: string; role?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const { username, password, role } = body;
    if (!username?.trim() || !password?.trim()) {
      return json({ error: "Username and password required" }, 400);
    }
    if (!role || !VALID_ROLES.includes(role as UserRole)) {
      return json({ error: "Invalid role" }, 400);
    }
    const allowedRoles = session.role === "superadmin"
      ? new Set<UserRole>(VALID_ROLES)
      : new Set<UserRole>(["editor", "viewer"]);
    if (!allowedRoles.has(role as UserRole)) return json({ error: "Cannot grant this role" }, 403);
    if (username.trim().length > 120 || password.length > 512) {
      return json({ error: "Invalid account fields" }, 400);
    }
    const environmentAdmin = environmentAdminCredentialIdentity();
    if (environmentAdmin.configured
      && canonicalUsername(username) === canonicalUsername(environmentAdmin.username)) {
      return json({ error: "Username is reserved for the environment administrator" }, 409);
    }

    try {
      if (await getStoredUserByUsername(username)) {
        return json({ error: "Username already exists" }, 409);
      }
    } catch {
      return json({ error: "Server error" }, 500);
    }

    if (password.trim().length < 12) {
      return json({ error: "Password must be at least 12 characters" }, 400);
    }

    try {
      await saveStoredUser({
        id: crypto.randomUUID(),
        username: username.trim().replace(/\s+/g, " "),
        passwordHash: hashPassword(password.trim()),
        role: role as UserRole,
        authVersion: 1,
        credentialSource: "local",
      }, { allowRecreate: true });
    } catch {
      return json({ error: "Account changed concurrently; retry" }, 409);
    }
    return json({ ok: true });
  }

  if (method === "PATCH") {
    return json({ error: "Password changes require the managed identity flow" }, 405);
  }

  if (method === "DELETE") {
    if (!hasPermission(session.role, "delete_user")) {
      return json({ error: "Permission Denied" }, 403);
    }

    let body: { username?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const { username } = body;
    if (!username?.trim()) {
      return json({ error: "Username required" }, 400);
    }
    if (canonicalUsername(username) === canonicalUsername(session.username)) {
      return json({ error: "Cannot delete the active account" }, 400);
    }

    try {
      await deleteStoredUser(username);
    } catch {
      return json({ error: "Server error" }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
