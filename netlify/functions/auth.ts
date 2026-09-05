import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
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
  sessionStorageKey,
  requireSameOrigin,
  validateSession,
  verifyPassword,
  type UserRole,
} from "./_shared/security";

type StoredUser = {
  username: string;
  role: UserRole;
  password?: string;
  passwordHash?: string;
};

const authStore = (name: string) => getStore({ name, consistency: "strong" });

const environmentAdmin = () => ({
  username: Netlify.env.get("ADMIN_USERNAME")?.trim() || "A",
  password: Netlify.env.get("ADMIN_PASSWORD")?.trim() || "",
  passwordHash: Netlify.env.get("ADMIN_PASSWORD_HASH")?.trim() || "",
});

async function upsertEnvironmentAdmin(username: string, passwordHash: string) {
  const store = authStore("users");
  let users: StoredUser[] = [];
  try {
    const data = await store.get("all", { type: "json" });
    if (Array.isArray(data)) users = data as StoredUser[];
  } catch {
    // Rebuild the authentication record below if the old representation is unreadable.
  }

  const record: StoredUser = {
    username,
    role: "superadmin",
    passwordHash,
  };
  const index = users.findIndex((candidate) => candidate.username === username);
  if (index >= 0) users[index] = record;
  else users.push(record);
  await store.setJSON("all", users);
  return record;
}

async function issueSession(username: string, role: UserRole) {
  const token = randomBytes(32).toString("hex");
  const session = createSession(username, role);
  await authStore("sessions").setJSON(sessionStorageKey(token), session);
  return json({ username, role, expiresAt: session.expiresAt }, 200, {
    "Set-Cookie": createSessionCookie(token),
  });
}

export default async (req: Request) => {
  const method = req.method;

  if (method === "POST") {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 8 * 1024) return json({ error: "Request too large" }, 413);

    let body: { username?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    const username = body.username?.trim() || "";
    const password = body.password || "";
    if (!username || !password.trim()) return json({ error: "Missing credentials" }, 400);
    if (username.length > 120 || password.length > 512) return json({ error: "Invalid credentials" }, 400);

    const recovery = environmentAdmin();
    const matchesHashedRecovery = recovery.passwordHash
      ? verifyPassword(password, recovery.passwordHash)
      : false;
    const matchesLegacyRecovery = recovery.password.length >= 4
      ? password === recovery.password
      : false;

    if (username === recovery.username && (matchesHashedRecovery || matchesLegacyRecovery)) {
      const recoveryHash = recovery.passwordHash || hashPassword(password);
      await upsertEnvironmentAdmin(recovery.username, recoveryHash);
      return issueSession(recovery.username, "superadmin");
    }

    let users: StoredUser[] = [];
    const userStore = authStore("users");
    try {
      const data = await userStore.get("all", { type: "json" });
      if (Array.isArray(data)) users = data as StoredUser[];
    } catch {
      return json({ error: "Server error" }, 500);
    }

    const user = users.find((candidate) => candidate.username === username);
    const valid = user
      ? user.passwordHash
        ? verifyPassword(password, user.passwordHash)
        : typeof user.password === "string" && user.password === password
      : false;
    if (!user || !valid) return json({ error: "Invalid credentials" }, 401);

    if (!user.passwordHash || needsPasswordRehash(user.passwordHash)) {
      const index = users.findIndex((candidate) => candidate.username === user.username);
      users[index] = {
        username: user.username,
        role: normalizeRole(user.role),
        passwordHash: hashPassword(password),
      };
      await userStore.setJSON("all", users);
    }

    return issueSession(user.username, normalizeRole(user.role));
  }

  if (method === "GET") {
    const session = await validateSession(req);
    if (!session) return json({ error: "Invalid session" }, 401);
    return json(session);
  }

  if (method === "DELETE") {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const token = getSessionToken(req);
    if (token) {
      try {
        await authStore("sessions").delete(sessionStorageKey(token));
      } catch {
        // Session already gone.
      }
    }
    return json({ ok: true }, 200, {
      "Set-Cookie": clearSessionCookie(),
      "Clear-Site-Data": '"cache", "cookies", "storage"',
    });
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
