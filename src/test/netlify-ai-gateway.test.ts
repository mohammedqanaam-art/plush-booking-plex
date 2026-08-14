import { afterEach, describe, expect, it, vi } from "vitest";
import { generateOpenAiText, isOpenAiConfigured } from "../../netlify/functions/_shared/openai";

describe("Netlify AI Gateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("routes OpenAI requests through the Netlify-provided base URL", async () => {
    const values: Record<string, string> = {
      OPENAI_API_KEY: "netlify-gateway-key",
      OPENAI_BASE_URL: "https://gateway.example.test/openai",
    };
    vi.stubGlobal("Netlify", {
      env: { get: vi.fn((key: string) => values[key]) },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "تم الاتصال" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(isOpenAiConfigured()).toBe(true);
    await expect(generateOpenAiText({
      instructions: "تعليمات",
      input: "اختبار",
      maxOutputTokens: 300,
    })).resolves.toEqual({ text: "تم الاتصال", model: "gpt-5-mini" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.test/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer netlify-gateway-key" }),
      }),
    );
  });

  it("falls back to the direct OpenAI endpoint for local development", async () => {
    vi.stubGlobal("Netlify", {
      env: { get: vi.fn((key: string) => key === "OPENAI_API_KEY" ? "local-key" : undefined) },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await generateOpenAiText({ instructions: "test", input: "test" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.any(Object),
    );
  });

  it("reads Netlify AI Gateway variables injected into process.env", async () => {
    vi.stubGlobal("Netlify", { env: { get: vi.fn(() => undefined) } });
    vi.stubEnv("OPENAI_API_KEY", "automatic-gateway-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://gateway.netlify.test/openai");
    vi.stubEnv("OPENAI_MODEL", "gpt-5-mini");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "يعمل" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(isOpenAiConfigured()).toBe(true);
    await expect(generateOpenAiText({ instructions: "test", input: "test" }))
      .resolves.toEqual({ text: "يعمل", model: "gpt-5-mini" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.netlify.test/openai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer automatic-gateway-key" }),
      }),
    );
  });
});
