import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  createSessionCookie,
  getSessionToken,
  hashPassword,
  isSameOriginRequest,
  needsPasswordRehash,
  sessionStorageKey,
  verifyPassword,
} from "../../netlify/functions/_shared/security";
import { decryptStoredJson, encryptStoredJson } from "../../netlify/functions/_shared/storage";

describe("Netlify password storage", () => {
  it("stores a derived password hash rather than the original password", () => {
    const password = "A-strong-admin-password";
    const encoded = hashPassword(password);

    expect(encoded).not.toContain(password);
    expect(encoded).toMatch(/^pbkdf2_sha256\$600000\$/);
    expect(verifyPassword(password, encoded)).toBe(true);
    expect(verifyPassword("wrong-password", encoded)).toBe(false);
    expect(needsPasswordRehash(encoded)).toBe(false);
  });

  it("keeps legacy PBKDF2 hashes verifiable but marks them for upgrade", () => {
    const legacy = "pbkdf2_sha256$310000$0123456789abcdef0123456789abcdef$5e9c4f9a14fc0cb7aac000b80cdce6102762a21729d594737a9266763b15cbf0";
    expect(needsPasswordRehash(legacy)).toBe(true);
    expect(verifyPassword("anything", "plain-text-value")).toBe(false);
  });

  it("keeps the session token in a strict HttpOnly cookie and hashes the storage key", () => {
    const token = "a".repeat(64);
    const cookie = createSessionCookie(token);

    expect(cookie).toContain(`__Host-res_admin_session=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(clearSessionCookie()).toContain("Max-Age=0");
    expect(getSessionToken(new Request("https://example.com", {
      headers: { cookie: `other=value; __Host-res_admin_session=${token}` },
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
