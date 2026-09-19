import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../netlify/functions/_shared/openai", () => ({ generateOpenAiText: vi.fn() }));
import handler from "../../netlify/functions/assistant-utility";
import { generateOpenAiText } from "../../netlify/functions/_shared/openai";

const request = (message: string, origin = "https://www.res-dashbord.com") => new Request("https://www.res-dashbord.com/api/assistant/utility", {
  method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ message }),
});

describe("public name and calculation endpoint", () => {
  beforeEach(() => vi.clearAllMocks());
  it("serves exact calculations and known names without a model", async () => {
    const response = await handler(request("٢٠٠ - ٢٠٪؜"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).reply).toContain("160.00");
    expect((await (await handler(request("محمد الدوسري"))).json()).reply).toContain("Mohammed Al Dosari");
    expect(generateOpenAiText).not.toHaveBeenCalled();
  });
  it("transliterates unknown names without tools or conversation context", async () => {
    vi.mocked(generateOpenAiText).mockResolvedValue({ text: "Salman Al Mansour", model: "test", sources: [] });
    const response = await handler(request("سلمان المنصور"));
    expect(response.status).toBe(200);
    expect((await response.json()).reply).toContain("Salman Al Mansour");
    expect(vi.mocked(generateOpenAiText).mock.calls[0][0]).toMatchObject({ input: '{"name":"سلمان المنصور"}', maxOutputTokens: 200 });
    expect(vi.mocked(generateOpenAiText).mock.calls[0][0]).not.toHaveProperty("webSearchAllowedDomains");
  });
  it.each(["اكتب كود بايثون", "غير اعدادات الموقع", "ما فروع بودل؟", "x".repeat(301)])("rejects non-utility requests: %s", async (message) => {
    expect((await handler(request(message))).status).toBe(400);
    expect(generateOpenAiText).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests", async () => {
    expect((await handler(request("سلمان المنصور", "https://example.com"))).status).toBe(403);
    expect(generateOpenAiText).not.toHaveBeenCalled();
  });
  it("fails honestly when spelling is unavailable or malformed", async () => {
    vi.mocked(generateOpenAiText).mockRejectedValueOnce(new Error("offline"));
    expect((await handler(request("سلمان المنصور"))).status).toBe(503);
    vi.mocked(generateOpenAiText).mockResolvedValueOnce({ text: "<script>bad</script>", model: "test", sources: [] });
    expect((await handler(request("سلمان المنصور"))).status).toBe(503);
  });
});
