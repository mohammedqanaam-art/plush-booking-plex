import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  createSessionCookie,
  getSessionToken,
  hashPassword,
  verifyPassword,
} from "../../netlify/functions/_shared/security";

describe("Netlify password storage", () => {
  it("stores a derived password hash rather than the original password", () => {
    const password = "A-strong-admin-password";
    const encoded = hashPassword(password);

    expect(encoded).not.toContain(password);
    expect(encoded).toMatch(/^pbkdf2_sha256\$310000\$/);
    expect(verifyPassword(password, encoded)).toBe(true);
    expect(verifyPassword("wrong-password", encoded)).toBe(false);
  });

  it("rejects malformed password records", () => {
    expect(verifyPassword("anything", "plain-text-value")).toBe(false);
  });

  it("keeps the session token in a strict HttpOnly cookie", () => {
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
