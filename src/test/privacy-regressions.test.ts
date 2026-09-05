import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { redactSensitiveMessage } from "@/lib/visitorAssistantClient";
import { publicBranches } from "@/data/publicBranches";
import { assistantModelLabel } from "@/lib/assistantModelLabel";

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

  it.each([
    "رمز التحقق 1234", "OTP: 123456", "رمز التحقق: ١٢٣٤٥٦", "کد OTP: ۱۲۳۴",
    "CVV 123", "١٢٣٤ هو رمز التحقق", "١٢٣٤", "رقمي ٠٥٠١٢٣٤٥٦٧", "جوال ۰۵۰۱۲۳۴۵۶۷",
    "رمز التحقق 1\u200b2\u200b3\u200b4", "كود التحقق 1 2 3 4 5 6",
  ])("redacts localized contact numbers and short credentials: %s", (message) => {
    expect(redactSensitiveMessage(message)).not.toMatch(/[0-9٠-٩۰-۹]/);
  });

  it("preserves useful price and date context", () => {
    expect(redactSensitiveMessage("السعر ٨٠٠ ريال والوصول ٢٠٢٦-٠٩-٠٥"))
      .toBe("السعر 800 ريال والوصول 2026-09-05");
  });

  it("uses one redaction implementation on client and server", () => {
    for (const name of ["visitor-agent", "employee-agent"]) {
      const source = fs.readFileSync(path.join(process.cwd(), `netlify/functions/${name}.ts`), "utf8");
      expect(source).toContain('import { redactSensitiveMessage } from "../../src/lib/redactSensitiveMessage"');
      expect(source).toContain('redactSensitiveMessage(String(value || ""))');
    }
  });

  it("ships only allowlisted public branch identity fields", () => {
    for (const branch of publicBranches) {
      expect(Object.keys(branch).sort()).toEqual(["brand", "brandCode", "city", "id", "name"]);
    }
    const build = fs.readFileSync(path.join(process.cwd(), "vite.config.ts"), "utf8");
    expect(build).toContain("private-data-client-boundary");
    expect(build).toContain("this.error(");
    const visitorKnowledge = fs.readFileSync(path.join(process.cwd(), "netlify/functions/_shared/visitorKnowledge.ts"), "utf8");
    expect(visitorKnowledge).toContain('from "../../../src/data/publicBranches"');
    expect(visitorKnowledge).not.toMatch(/sheetOperationalData|data\/hotels|employeeKnowledge/);
  });

  it("never labels a cached, local or different model response as Sol", () => {
    expect(assistantModelLabel({})).toBe("مساعد BHG");
    expect(assistantModelLabel({ model: "gpt-5.6-sol", provider: "openai-responses" })).toBe("GPT‑5.6 Sol");
    expect(assistantModelLabel({ model: "gpt-5.6-terra" })).toBe("gpt-5.6-terra");
    expect(assistantModelLabel({ model: "gpt-5.6-sol", provider: "bhg-answer-cache" })).toBe("إجابة محفوظة");
    expect(assistantModelLabel({ model: null, provider: "bhg-knowledge-fast-path" })).toBe("مرجع BHG مباشر");
  });
});
