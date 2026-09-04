import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { redactSensitiveMessage } from "@/lib/visitorAssistantClient";

describe("confidential workspace boundaries", () => {
  it("requires a server session before returning reports or running the employee assistant", () => {
    const bookings = fs.readFileSync(path.join(process.cwd(), "netlify/functions/bookings.ts"), "utf8");
    const assistant = fs.readFileSync(path.join(process.cwd(), "netlify/functions/employee-agent.ts"), "utf8");

    expect(bookings).toContain("const session = await validateSession(req)");
    expect(bookings).not.toContain("publicCachedJson");
    expect(assistant).toContain("if (!await validateSession(req))");
  });

  it("redacts common contact and credential patterns before an assistant request", () => {
    const protectedText = redactSensitiveMessage(
      "جوال الضيف 0501234567 والبريد guest@example.com و api_key=sk-exampleSecret123456",
    );

    expect(protectedText).not.toContain("0501234567");
    expect(protectedText).not.toContain("guest@example.com");
    expect(protectedText).not.toContain("sk-exampleSecret123456");
    expect(protectedText).toContain("[رقم محجوب]");
    expect(protectedText).toContain("[بريد محجوب]");
  });

  it("marks every internal page as non-cacheable and non-indexable", () => {
    const config = fs.readFileSync(path.join(process.cwd(), "netlify.toml"), "utf8");
    for (const route of ["/assistant", "/operations", "/booking-reports", "/knowledge-bank"]) {
      expect(config).toContain(`for = "${route}"`);
    }
    expect(config).toContain("noindex, nofollow, noarchive, nosnippet");
  });
});
