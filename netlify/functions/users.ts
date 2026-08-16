import type { Config } from "@netlify/functions";
import { hashPassword, json, requireSameOrigin, VALID_ROLES, validateSession, verifyPassword, type UserRole } from "./_shared/security";
import { getEncryptedEnvironmentStore } from "./_shared/storage";

type User = { username: string; role: UserRole; password?: string; passwordHash?: string };

function hasPermission(role: string, action: string): boolean {
  const perms: Record<string, string[]> = {
    superadmin: ["view_users", "add_user", "delete_user"],
    admin: ["view_users", "add_user"],
    editor: ["view_users"],
    viewer: ["view_users"],
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

  const userStore = getEncryptedEnvironmentStore("users", { consistency: "strong" });

  if (method === "GET") {
    if (!hasPermission(session.role, "view_users")) {
      return json({ error: "Permission Denied" }, 403);
    }
    try {
      const users = (await userStore.get<User[]>("all", { type: "json" })) || [];
      const safeUsers = users.map((u) => ({
        username: u.username,
        role: u.role || "admin",
      }));
      return json({ users: safeUsers });
    } catch {
      return json({ users: [] });
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
    if (username.trim().length > 120 || password.length > 512) {
      return json({ error: "Invalid account fields" }, 400);
    }

    let users: User[] = [];
    try {
      users = (await userStore.get<User[]>("all", { type: "json" })) || [];
    } catch {
      users = [];
    }

    if (users.some((u) => u.username === username.trim())) {
      return json({ error: "Username already exists" }, 409);
    }

    if (password.trim().length < 12) {
      return json({ error: "Password must be at least 12 characters" }, 400);
    }

    users.push({ username: username.trim(), passwordHash: hashPassword(password.trim()), role: role as UserRole });
    await userStore.setJSON("all", users);
    return json({ ok: true });
  }

  if (method === "PATCH") {
    let body: { currentPassword?: string; newPassword?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const { currentPassword, newPassword } = body;
    if (!currentPassword?.trim() || !newPassword?.trim()) {
      return json({ error: "Current password and new password are required" }, 400);
    }
    if (newPassword.trim().length < 12 || newPassword.length > 512) {
      return json({ error: "New password must be between 12 and 512 characters" }, 400);
    }

    let users: User[] = [];
    try {
      users = (await userStore.get<User[]>("all", { type: "json" })) || [];
    } catch {
      return json({ error: "Server error" }, 500);
    }

    const userIndex = users.findIndex((u) => u.username === session.username);
    if (userIndex === -1) {
      return json({ error: "User not found" }, 404);
    }
    const stored = users[userIndex];
    const passwordMatches = stored.passwordHash
      ? verifyPassword(currentPassword.trim(), stored.passwordHash)
      : stored.password === currentPassword.trim();
    if (!passwordMatches) {
      return json({ error: "Current password is incorrect" }, 403);
    }

    users[userIndex] = {
      username: stored.username,
      role: stored.role,
      passwordHash: hashPassword(newPassword.trim()),
    };
    await userStore.setJSON("all", users);
    return json({ ok: true });
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
    if (username.trim() === session.username) {
      return json({ error: "Cannot delete the active account" }, 400);
    }

    let users: User[] = [];
    try {
      users = (await userStore.get<User[]>("all", { type: "json" })) || [];
    } catch {
      return json({ error: "Server error" }, 500);
    }

    const filtered = users.filter((u) => u.username !== username.trim());
    await userStore.setJSON("all", filtered);
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
