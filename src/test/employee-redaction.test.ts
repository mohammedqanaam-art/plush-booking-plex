import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "../../netlify/functions/_shared/redaction";

describe("employee call review redaction", () => {
  it("redacts payment cards, Saudi phones, identities, OTPs, email, and API secrets", () => {
    const source = [
      "بطاقتي 4111 1111 1111 1111",
      "الجوال 0501234567 والهوية 1023456789",
      "رمز التحقق: 123456",
      "email guest@example.com",
      "Bearer abcdefghijklmnopqrstuvwxyz",
      "sk-example1234567890",
    ].join("\n");
    const result = redactSensitiveText(source);

    expect(result).not.toContain("4111");
    expect(result).not.toContain("0501234567");
    expect(result).not.toContain("1023456789");
    expect(result).not.toContain("123456");
    expect(result).not.toContain("guest@example.com");
    expect(result).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(result).toContain("[بيانات دفع محجوبة]");
    expect(result).toContain("[هاتف محجوب]");
    expect(result).toContain("[هوية محجوبة]");
  });

  it("keeps reservation identifiers and dates that are not sensitive patterns", () => {
    expect(redactSensitiveText("UNO 12345678 بتاريخ 2026-09-04")).toBe("UNO 12345678 بتاريخ 2026-09-04");
  });

  it("redacts broad phone-like numbers in the stricter call-review mode", () => {
    const result = redactSensitiveText(
      "أرضي 0112345678 ودولي 00442079460000 وآخر +1 (415) 555-2671 ومعرف 12345678",
      80_000,
      { redactAllPhoneLike: true },
    );
    expect(result).not.toMatch(/0112345678|00442079460000|415|12345678/);
    expect(result.match(/\[(?:رقم|هاتف) محجوب\]/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
