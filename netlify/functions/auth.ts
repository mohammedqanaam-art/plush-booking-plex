import type { Config } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import {
  clearSessionCookie,
  createSession,
  createSessionCookie,
  getSessionToken,
  hashPassword,
  json,
  needsPasswordRehash,
  normalizeRole,
  requireSameOrigin,
  sessionStorageKey,
  validateSession,
  verifyPassword,
  type UserRole,
} from "./_shared/security";
import { getEncryptedEnvironmentStore } from "./_shared/storage";

type StoredUser = {
  username: string;
  role: UserRole;
  password?: string;
  passwordHash?: string;
};

async function ensureDefaultUser() {
  const store = getEncryptedEnvironmentStore("users", { consistency: "strong" });
  try {
    const data = await store.get<StoredUser[]>("all", { type: "json" });
    if (Array.isArray(data) && data.length > 0) return;
  } catch {
    // store empty or not yet initialised – proceed to seed default user
  }
  const username = Netlify.env.get("ADMIN_USERNAME")?.trim();
  const password = Netlify.env.get("ADMIN_PASSWORD")?.trim();
  if (!username || !password || password.length < 12) return false;
  await store.setJSON("all", [{ username, passwordHash: hashPassword(password), role: "superadmin" }]);
  return true;
}

export default async (req: Request) => {
  const method = req.method;

  if (["POST", "DELETE"].includes(method)) {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
  }

  if (method === "POST") {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 8 * 1024) return json({ error: "Request too large" }, 413);

    let body: { username?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    const { username, password } = body;
    if (!username?.trim() || !password?.trim()) {
      return json({ error: "Missing credentials" }, 400);
    }
    if (username.trim().length > 120 || password.length > 512) {
      return json({ error: "Invalid credentials" }, 400);
    }

    const seeded = await ensureDefaultUser();

    const userStore = getEncryptedEnvironmentStore("users", { consistency: "strong" });
    let users: StoredUser[];
    try {
      users = (await userStore.get<StoredUser[]>("all", { type: "json" })) || [];
      if (!Array.isArray(users)) users = [];
    } catch {
      return json({ error: "Server error" }, 500);
    }

    if (!users.length && !seeded) {
      return json({ error: "Administrator setup required" }, 503);
    }

    const normalizedUsername = username.trim();
    const user = users.find((u) => u.username === normalizedUsername);
    const passwordIsValid = user
      ? user.passwordHash
        ? verifyPassword(password, user.passwordHash)
        : typeof user.password === "string" && user.password === password
      : false;
    if (!user || !passwordIsValid) {
      return json({ error: "Invalid credentials" }, 401);
    }

    // Upgrade legacy plain-text records and older PBKDF2 work factors after a valid login.
    if (!user.passwordHash || needsPasswordRehash(user.passwordHash)) {
      const index = users.findIndex((candidate) => candidate.username === user.username);
      users[index] = {
        username: user.username,
        role: normalizeRole(user.role),
        passwordHash: hashPassword(password),
      };
      await userStore.setJSON("all", users);
    }

    const token = randomBytes(32).toString("hex");
    const role = normalizeRole(user.role);
    const session = createSession(user.username, role);
    const sessionStore = getEncryptedEnvironmentStore("sessions", { consistency: "strong" });
    await sessionStore.setJSON(sessionStorageKey(token), session);

    return json({
      username: user.username,
      role,
      expiresAt: session.expiresAt,
    }, 200, { "Set-Cookie": createSessionCookie(token) });
  }

  if (method === "GET") {
    const session = await validateSession(req);
    if (!session) return json({ error: "Invalid session" }, 401);
    return json(session);
  }

  if (method === "DELETE") {
    const token = getSessionToken(req);
    if (token) {
      const sessionStore = getEncryptedEnvironmentStore("sessions", { consistency: "strong" });
      try {
        await sessionStore.delete(sessionStorageKey(token));
      } catch {
        // session already gone – safe to ignore
      }
    }
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  rateLimit: {
    windowLimit: 8,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
