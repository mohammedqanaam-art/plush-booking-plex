import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import {
  clearSessionCookie,
  canonicalUsername,
  createSession,
  createSessionCookie,
  environmentAdminCredentialIdentity,
  getSessionToken,
  json,
  requireSameOrigin,
  sessionStorageKey,
  validateSession,
  verifyPassword,
  type UserRole,
} from "./_shared/security";
import { evaluateAdminNetwork } from "./_shared/corporateNetwork";
import {
  getStoredUserByUsername,
  isEnvironmentManagedUser,
  saveStoredUser,
  type StoredUser,
} from "./_shared/userDirectory";

const sessionStore = () => getStore({ name: "sessions", consistency: "strong" });

const environmentAdmin = () => ({
  username: Netlify.env.get("ADMIN_USERNAME")?.trim() || "A",
  passwordHash: Netlify.env.get("ADMIN_PASSWORD_HASH")?.trim() || "",
});

async function upsertEnvironmentAdmin(username: string, passwordHash: string) {
  const existing = await getStoredUserByUsername(username);
  if (existing?.credentialSource === "local") {
    throw new Error("ENVIRONMENT_ADMIN_USERNAME_CONFLICT");
  }
  const credentialsChanged = Boolean(existing && existing.passwordHash !== passwordHash);
  if (existing
    && existing.role === "superadmin"
    && existing.credentialSource === "environment"
    && !credentialsChanged) return existing;
  const record: StoredUser = {
    id: existing?.id || crypto.randomUUID(),
    username,
    role: "superadmin",
    authVersion: Number(existing?.authVersion || 1) + (credentialsChanged ? 1 : 0),
    generation: existing?.generation || crypto.randomUUID(),
    credentialSource: "environment",
    passwordHash,
  };
  return saveStoredUser(record, { allowRecreate: true });
}

async function issueSession(user: Required<Pick<StoredUser, "id" | "username" | "role" | "authVersion">>) {
  const token = randomBytes(32).toString("hex");
  const environmentCredential = environmentAdminCredentialIdentity();
  const environmentCredentialFingerprint = environmentCredential.configured
    && canonicalUsername(user.username) === canonicalUsername(environmentCredential.username)
    ? environmentCredential.fingerprint || undefined
    : undefined;
  const session = createSession(
    user.id,
    user.username,
    user.role,
    user.authVersion,
    environmentCredentialFingerprint,
  );
  await sessionStore().setJSON(sessionStorageKey(token), session);
  return json({ username: user.username, role: user.role, expiresAt: session.expiresAt }, 200, {
    "Set-Cookie": createSessionCookie(token),
  });
}

export default async (req: Request, context: Context) => {
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
    const recoveryConfigured = Boolean(recovery.passwordHash);
    const recoveryUsernameMatches = canonicalUsername(username) === canonicalUsername(recovery.username);

    if (recoveryUsernameMatches && recoveryConfigured && !matchesHashedRecovery) {
      return json({ error: "Invalid credentials" }, 401);
    }

    if (recoveryUsernameMatches && matchesHashedRecovery) {
      if (!evaluateAdminNetwork("superadmin", context.ip).allowed) {
        return json({ error: "Corporate network required" }, 403);
      }
      try {
        const user = await upsertEnvironmentAdmin(recovery.username, recovery.passwordHash);
        return issueSession({
          id: String(user.id),
          username: user.username,
          role: user.role,
          authVersion: Number(user.authVersion || 1),
        });
      } catch (error) {
        if (error instanceof Error && error.message === "ENVIRONMENT_ADMIN_USERNAME_CONFLICT") {
          return json({ error: "Environment administrator username conflicts with a local account" }, 409);
        }
        return json({ error: "Server error" }, 500);
      }
    }

    try {
      const user = await getStoredUserByUsername(username);
      if (user && isEnvironmentManagedUser(user)) {
        return json({ error: "Invalid credentials" }, 401);
      }
      const valid = user
        ? user.passwordHash
          ? verifyPassword(password, user.passwordHash)
          : false
        : false;
      if (!user || !valid) return json({ error: "Invalid credentials" }, 401);

      if (!evaluateAdminNetwork(user.role, context.ip).allowed) {
        return json({ error: "Corporate network required" }, 403);
      }

      return issueSession({
        id: user.id,
        username: user.username,
        role: user.role,
        authVersion: user.authVersion,
      });
    } catch {
      return json({ error: "Server error" }, 500);
    }
  }

  if (method === "GET") {
    const session = await validateSession(req);
    if (!session) return json({ error: "Invalid session" }, 401);
    return json({
      username: session.username,
      role: session.role,
      expiresAt: session.expiresAt,
      network: evaluateAdminNetwork(session.role, context.ip),
    });
  }

  if (method === "DELETE") {
    const token = getSessionToken(req);
    if (token) {
      try {
        await sessionStore().delete(sessionStorageKey(token));
      } catch {
        // Session already gone.
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
