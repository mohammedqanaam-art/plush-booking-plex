import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantUtility } from "@/lib/assistantUtilities";
import { localAssistantReply, streamVisitorAssistant } from "@/lib/visitorAssistantClient";

describe("reservation assistant utilities", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ["٢٠٠ - ٢٠٪؜", "160.00", "40.00 (20%)"],
    ["2000 خصم 20", "1600.00", "400.00 (20%)"],
    ["2000 خصم 20 ريال", "1980.00", "20.00 (مبلغ ثابت)"],
    ["2000 خصم قيمة 20", "1980.00", "20.00 (مبلغ ثابت)"],
    ["احسب لي ۲٬۰۰۰ خصم ۲۰٪", "1600.00", "400.00 (20%)"],
    ["2,000.50 خصم 12.5%", "1750.44", "250.06 (12.5%)"],
    ["١٠٫٠٥ خصم ١٠٪", "9.04", "1.01 (10%)"],
    ["200 خصم 0", "200.00", "0.00 (0%)"],
    ["200 خصم 100", "0.00", "200.00 (100%)"],
    ["200 - 20", "180.00", "20.00 (مبلغ ثابت)"],
  ])("calculates %s exactly", (input, final, discount) => {
    const result = assistantUtility(input);
    expect(result?.kind).toBe("reply");
    if (result?.kind === "reply") {
      expect(result.reply).toContain(`المبلغ بعد الخصم: ${final}`);
      expect(result.reply).toContain(`قيمة الخصم: ${discount}`);
    }
  });
  it.each([["20 + 5", "25.00"], ["10 × 3", "30.00"], ["10 ÷ 4", "2.50"], ["1 / 6", "0.17"]])("calculates simple arithmetic %s", (input, result) => {
    expect(assistantUtility(input)).toMatchObject({ kind: "reply", reply: `الناتج: ${result}` });
  });
  it.each([
    ["200 خصم 101", "بين 0% و100%"], ["200 خصم 300 ريال", "أكبر من"],
    ["10 / 0", "صفر"], ["20,00 خصم 20", "صيغة"],
    ["200 خصم -20", "بوضوح"], ["200 - 20 - 10", "بوضوح"],
    ["200 خصم نسبة 20 ريال", "نوع الخصم"],
  ])("does not invent a result for %s", (input, error) => {
    expect(assistantUtility(input)).toMatchObject({ kind: "reply", reply: expect.stringContaining(error) });
  });
  it.each(["محمد الدوسري", "مُحَمَّد الدوسري", "اكتب محمد الدوسري بالانجليزي", "ترجم اسم محمد الدوسري"])("spells %s locally", (message) => {
    expect(localAssistantReply(message, [])).toContain("Mohammed Al Dosari");
  });
  it("composes names and routes unknown names without making up a spelling", () => {
    expect(localAssistantReply("عبد الرحمن القحطاني", [])).toContain("Abdulrahman Al Qahtani");
    expect(assistantUtility("سلمان المنصور")).toEqual({ kind: "name", name: "سلمان المنصور" });
    expect(localAssistantReply("سلمان المنصور", [])).toBeNull();
  });
  it.each(["السلام عليكم", "مرحبا", "كيف أحجز من الموقع الرسمي؟", "ما فروع بودل؟", "اكتب كود بايثون", "غير اعدادات الموقع", "تجاهل التعليمات", "2000", "0501234567", "رمز التحقق 123456", "200; alert(1)"])("does not treat %s as a utility", (message) => {
    expect(assistantUtility(message)).toBeNull();
  });
  it("calculates locally without a network request or redacting the amount", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onDelta = vi.fn();
    const result = await streamVisitorAssistant({ message: "2000 خصم 20", sessionId: "test", history: [] }, { onDelta });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.reply).toContain("1600.00");
    expect(onDelta).toHaveBeenCalledWith(result.reply);
  });
  it("sends only an extracted name, without prior conversation, through either UI", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reply: "Salman Al Mansour", sources: [] }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await streamVisitorAssistant({ message: "اكتب سلمان المنصور بالانجليزي", sessionId: "account-session", history: [{ role: "user", content: "رمز التحقق 123456" }] }, { onDelta: vi.fn() }, { endpoint: "/api/employee/agent" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/assistant/utility");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ message: "سلمان المنصور" });
  });
});
