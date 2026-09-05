import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionCookie,
  canonicalUsername,
  createSessionCookie,
  environmentAdminCredentialIdentity,
  getSessionToken,
  hashPassword,
  isSameOriginRequest,
  needsPasswordRehash,
  normalizeRole,
  sessionStorageKey,
  verifyPassword,
} from "../../netlify/functions/_shared/security";
import { decryptStoredJson, encryptStoredJson } from "../../netlify/functions/_shared/storage";
import { evaluateAdminNetwork } from "../../netlify/functions/_shared/corporateNetwork";
import { isEnvironmentManagedUser } from "../../netlify/functions/_shared/userDirectory";

afterEach(() => vi.unstubAllGlobals());

describe("Netlify password storage", () => {
  it("canonicalizes equivalent usernames before uniqueness and authentication checks", () => {
    expect(canonicalUsername("  Mohammed   QA  ")).toBe("mohammed qa");
    expect(canonicalUsername("ＭＯＨＡＭＭＥＤ")).toBe("mohammed");
  });

  it("fails closed to viewer when a legacy role is missing or invalid", () => {
    expect(normalizeRole(undefined)).toBe("viewer");
    expect(normalizeRole("owner")).toBe("viewer");
  });

  it("stores a derived password hash rather than the original password", () => {
    const password = "A-strong-admin-password";
    const encoded = hashPassword(password);

    expect(encoded).not.toContain(password);
    expect(encoded).toMatch(/^pbkdf2_sha256\$600000\$/);
    expect(verifyPassword(password, encoded)).toBe(true);
    expect(verifyPassword("wrong-password", encoded)).toBe(false);
    expect(needsPasswordRehash(encoded)).toBe(false);
  }, 15_000);

  it("keeps legacy PBKDF2 hashes verifiable but marks them for upgrade", () => {
    const legacy = "pbkdf2_sha256$310000$0123456789abcdef0123456789abcdef$5e9c4f9a14fc0cb7aac000b80cdce6102762a21729d594737a9266763b15cbf0";
    expect(needsPasswordRehash(legacy)).toBe(true);
    expect(verifyPassword("anything", "plain-text-value")).toBe(false);
  });

  it("keeps the session token in a strict HttpOnly cookie and hashes the storage key", () => {
    const token = "a".repeat(64);
    const cookie = createSessionCookie(token);

    expect(cookie).toContain(`res_admin_session=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(clearSessionCookie()).toContain("Max-Age=0");
    expect(getSessionToken(new Request("https://example.com", {
      headers: { cookie: `other=value; res_admin_session=${token}` },
    }))).toBe(token);

    const storageKey = sessionStorageKey(token);
    expect(storageKey).toMatch(/^sess_[a-f0-9]{64}$/);
    expect(storageKey).not.toContain(token);
  });

  it("accepts a valid bearer token only as a migration fallback", () => {
    const token = "b".repeat(64);
    expect(getSessionToken(new Request("https://example.com", {
      headers: { Authorization: `Bearer ${token}` },
    }))).toBe(token);
    expect(getSessionToken(new Request("https://example.com", {
      headers: { Authorization: "Bearer invalid" },
    }))).toBeNull();
  });
});

describe("same-origin mutation protection", () => {
  it("accepts same-origin requests and rejects a foreign browser origin", () => {
    expect(isSameOriginRequest(new Request("https://www.res-dashbord.com/.netlify/functions/auth", {
      method: "POST",
      headers: { origin: "https://www.res-dashbord.com" },
    }))).toBe(true);

    expect(isSameOriginRequest(new Request("https://www.res-dashbord.com/.netlify/functions/auth", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }))).toBe(false);
  });

  it("accepts the public custom domain when Netlify forwards to an internal host", () => {
    expect(isSameOriginRequest(new Request("https://internal-function-host.netlify.app/.netlify/functions/auth", {
      method: "POST",
      headers: {
        origin: "https://www.res-dashbord.com",
        "x-forwarded-host": "www.res-dashbord.com",
        "x-forwarded-proto": "https",
      },
    }))).toBe(true);
  });
});

describe("corporate admin network policy", () => {
  const configure = (values: Record<string, string>) => vi.stubGlobal("Netlify", {
    env: { get: (name: string) => values[name] || undefined },
  });

  it("accepts an administrator only from an allowlisted corporate CIDR in enforce mode", () => {
    configure({ ADMIN_NETWORK_MODE: "enforce", ADMIN_NETWORK_CIDRS: "10.20.0.0/16, 203.0.113.18" });
    expect(evaluateAdminNetwork("admin", "10.20.4.9")).toMatchObject({ allowed: true, trusted: true });
    expect(evaluateAdminNetwork("superadmin", "198.51.100.2")).toMatchObject({ allowed: false, trusted: false, reason: "untrusted" });
  });

  it("fails closed when enforcement is enabled without a company allowlist", () => {
    configure({ ADMIN_NETWORK_MODE: "enforce" });
    expect(evaluateAdminNetwork("admin", "10.0.0.2")).toMatchObject({ allowed: false, reason: "missing-allowlist" });
    expect(evaluateAdminNetwork("editor", "198.51.100.2")).toMatchObject({ allowed: true, required: false });
  });

  it("changes the environment-admin session fingerprint when its configured credential rotates", () => {
    const configure = (values: Record<string, string>) => vi.stubGlobal("Netlify", {
      env: { get: (name: string) => values[name] || undefined },
    });

    configure({ ADMIN_USERNAME: "Root Admin", ADMIN_PASSWORD_HASH: "first-hash" });
    const first = environmentAdminCredentialIdentity();
    configure({ ADMIN_USERNAME: "Root Admin", ADMIN_PASSWORD_HASH: "second-hash" });
    const second = environmentAdminCredentialIdentity();

    expect(first.configured).toBe(true);
    expect(first.username).toBe("Root Admin");
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect(JSON.stringify(first)).not.toContain("first-hash");
  });

  it("does not accept a plaintext environment-admin password as a configured credential", () => {
    vi.stubGlobal("Netlify", {
      env: { get: (name: string) => name === "ADMIN_PASSWORD" ? "human-password-must-not-be-hashed-directly" : undefined },
    });
    expect(environmentAdminCredentialIdentity()).toMatchObject({ configured: false, fingerprint: null });
  });

  it("keeps environment-managed and legacy superadmin accounts out of local-password fallback", () => {
    expect(isEnvironmentManagedUser({ role: "superadmin", credentialSource: "environment" })).toBe(true);
    expect(isEnvironmentManagedUser({ role: "superadmin" })).toBe(true);
    expect(isEnvironmentManagedUser({ role: "superadmin", credentialSource: "local" })).toBe(false);
    expect(isEnvironmentManagedUser({ role: "admin" })).toBe(false);
  });
});

describe("application-layer sensitive storage", () => {
  it("encrypts JSON using AES-256-GCM and binds ciphertext to store/key context", () => {
    const key = Buffer.alloc(32, 7);
    const source = { guestName: "Guest", phone: "0500000000", reservation: "ABC123" };
    const encrypted = encryptStoredJson(source, "bookings", "data", key);

    expect(encrypted.alg).toBe("aes-256-gcm");
    expect(encrypted.data).not.toContain("0500000000");
    expect(decryptStoredJson(encrypted, "bookings", "data", key)).toEqual(source);
    expect(() => decryptStoredJson(encrypted, "contacts", "data", key)).toThrow();
  });
});
