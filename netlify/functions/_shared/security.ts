import { getStore } from "@netlify/blobs";
import { getContext } from "@netlify/functions";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { evaluateAdminNetwork } from "./corporateNetwork";
import {
  canonicalUsername,
  getStoredUserByUsername,
  isEnvironmentManagedUser,
  normalizeRole,
  VALID_ROLES,
  type UserRole,
} from "./userDirectory";

export { canonicalUsername, normalizeRole, VALID_ROLES, type UserRole } from "./userDirectory";

export { isSameOriginRequest, json, requireSameOrigin } from "./http";

export type Session = {
  userId: string;
  username: string;
  role: UserRole;
  authVersion: number;
  environmentCredentialFingerprint?: string;
  createdAt: number;
  expiresAt: number;
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_KEY_LENGTH = 32;
const SESSION_COOKIE = "res_admin_session";

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return /^[a-f0-9]{64}$/i.test(token) ? token : null;
}

function getCookieToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== SESSION_COOKIE) continue;
    const token = rawValue.join("=").trim();
    return /^[a-f0-9]{64}$/i.test(token) ? token : null;
  }
  return null;
}

export function getSessionToken(req: Request): string | null {
  return getCookieToken(req) || getBearerToken(req);
}

export function sessionStorageKey(token: string): string {
  return `sess_${createHash("sha256").update(token).digest("hex")}`;
}

export function createSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

const sessionStore = () => getStore({ name: "sessions", consistency: "strong" });

const currentClientIp = () => {
  try {
    return getContext().ip;
  } catch {
    return undefined;
  }
};

export type EnvironmentAdminCredentialIdentity = {
  username: string;
  configured: boolean;
  fingerprint: string | null;
};

export function environmentAdminCredentialIdentity(): EnvironmentAdminCredentialIdentity {
  const username = Netlify.env.get("ADMIN_USERNAME")?.trim() || "A";
  const passwordHash = Netlify.env.get("ADMIN_PASSWORD_HASH")?.trim() || "";

  return {
    username,
    configured: Boolean(passwordHash),
    fingerprint: passwordHash
      ? createHash("sha256")
        .update(`res-env-admin-v2\0${canonicalUsername(username)}\0${passwordHash}`)
        .digest("hex")
      : null,
  };
}

export async function validateSession(req: Request): Promise<Session | null> {
  const token = getSessionToken(req);
  if (!token) return null;

  const store = sessionStore();
  try {
    const raw = await store.get(sessionStorageKey(token), { type: "json" }) as Partial<Session> | null;
    if (!raw?.userId || !raw.username || !raw.role || !VALID_ROLES.includes(raw.role)) return null;

    const createdAt = Number(raw.createdAt || 0);
    const expiresAt = Number(raw.expiresAt || createdAt + SESSION_TTL_MS);
    const authVersion = Number(raw.authVersion || 0);
    if (!createdAt || !Number.isSafeInteger(authVersion) || authVersion < 1 || expiresAt <= Date.now()) {
      await store.delete(sessionStorageKey(token)).catch(() => undefined);
      return null;
    }

    const user = await getStoredUserByUsername(raw.username);
    if (!user
      || user.id !== raw.userId
      || canonicalUsername(user.username) !== canonicalUsername(raw.username)
      || user.role !== raw.role
      || Number(user.authVersion || 1) !== authVersion) {
      await store.delete(sessionStorageKey(token)).catch(() => undefined);
      return null;
    }

    const environmentAdmin = environmentAdminCredentialIdentity();
    const isCurrentEnvironmentUsername = environmentAdmin.configured
      && canonicalUsername(raw.username) === canonicalUsername(environmentAdmin.username);
    if ((isCurrentEnvironmentUsername
      && raw.environmentCredentialFingerprint !== environmentAdmin.fingerprint)
      || (isEnvironmentManagedUser(user)
        && (!isCurrentEnvironmentUsername
          || raw.environmentCredentialFingerprint !== environmentAdmin.fingerprint))) {
      await store.delete(sessionStorageKey(token)).catch(() => undefined);
      return null;
    }

    if (!evaluateAdminNetwork(user.role, currentClientIp()).allowed) return null;

    return {
      userId: raw.userId,
      username: raw.username,
      role: raw.role,
      authVersion,
      environmentCredentialFingerprint: raw.environmentCredentialFingerprint,
      createdAt,
      expiresAt,
    };
  } catch {
    return null;
  }
}

export function createSession(
  userId: string,
  username: string,
  role: UserRole,
  authVersion: number,
  environmentCredentialFingerprint?: string,
): Session {
  const createdAt = Date.now();
  return {
    userId,
    username,
    role,
    authVersion,
    ...(environmentCredentialFingerprint ? { environmentCredentialFingerprint } : {}),
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, "sha256").toString("hex");
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt}$${key}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, iterationsValue, salt, expectedHex] = encoded.split("$");
  const iterations = Number(iterationsValue);
  if (algorithm !== "pbkdf2_sha256" || !salt || !expectedHex || !Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) return false;

  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function needsPasswordRehash(encoded: string): boolean {
  const [algorithm, iterationsValue] = encoded.split("$");
  return algorithm !== "pbkdf2_sha256" || Number(iterationsValue) < PASSWORD_ITERATIONS;
}
