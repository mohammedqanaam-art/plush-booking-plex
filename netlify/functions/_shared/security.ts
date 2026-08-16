import { getStore } from "@netlify/blobs";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export const VALID_ROLES = ["superadmin", "admin", "editor", "viewer"] as const;
export type UserRole = (typeof VALID_ROLES)[number];
export type Session = {
  username: string;
  role: UserRole;
  createdAt: number;
  expiresAt: number;
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_KEY_LENGTH = 32;
const SESSION_COOKIE = "res_admin_session";

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.append("Vary", "Cookie");
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

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

function trustedRequestOrigins(req: Request): Set<string> {
  const origins = new Set<string>([
    "https://res-dashbord.com",
    "https://www.res-dashbord.com",
  ]);
  const addOrigin = (value?: string | null) => {
    if (!value) return;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed proxy/environment values.
    }
  };

  addOrigin(req.url);

  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost && /^(https?|wss?)$/i.test(forwardedProto)) {
    addOrigin(`${forwardedProto.toLowerCase()}://${forwardedHost}`);
  }

  if (typeof Netlify !== "undefined") {
    addOrigin(Netlify.env.get("URL"));
    addOrigin(Netlify.env.get("DEPLOY_PRIME_URL"));
    addOrigin(Netlify.env.get("DEPLOY_URL"));
  }

  return origins;
}

export function isSameOriginRequest(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return trustedRequestOrigins(req).has(new URL(origin).origin);
    } catch {
      return false;
    }
  }

  const fetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (!fetchSite) return true;
  return fetchSite === "same-origin" || fetchSite === "none";
}

export function requireSameOrigin(req: Request): Response | null {
  return isSameOriginRequest(req) ? null : json({ error: "Cross-origin request rejected" }, 403);
}

const sessionStore = () => getStore({ name: "sessions", consistency: "strong" });

export async function validateSession(req: Request): Promise<Session | null> {
  const token = getSessionToken(req);
  if (!token) return null;

  const store = sessionStore();
  try {
    const raw = await store.get(sessionStorageKey(token), { type: "json" }) as Partial<Session> | null;
    if (!raw?.username || !raw.role || !VALID_ROLES.includes(raw.role)) return null;

    const createdAt = Number(raw.createdAt || 0);
    const expiresAt = Number(raw.expiresAt || createdAt + SESSION_TTL_MS);
    if (!createdAt || expiresAt <= Date.now()) {
      await store.delete(sessionStorageKey(token)).catch(() => undefined);
      return null;
    }

    return { username: raw.username, role: raw.role, createdAt, expiresAt };
  } catch {
    return null;
  }
}

export function createSession(username: string, role: UserRole): Session {
  const createdAt = Date.now();
  return { username, role, createdAt, expiresAt: createdAt + SESSION_TTL_MS };
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

export function normalizeRole(role: unknown): UserRole {
  return VALID_ROLES.includes(role as UserRole) ? (role as UserRole) : "admin";
}
