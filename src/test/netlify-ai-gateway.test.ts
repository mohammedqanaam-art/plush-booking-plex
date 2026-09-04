import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateOpenAiText,
  generateOpenAiTextStream,
  isOpenAiConfigured,
} from "../../netlify/functions/_shared/openai";

const responsesPayload = (text: string, model: string) => ({
  id: `resp_${model.replace(/[^a-z0-9]/gi, "_")}`,
  model,
  output: [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text,
          annotations: [],
        },
      ],
    },
  ],
});

describe("Netlify AI Gateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("routes OpenAI Responses requests through the Netlify-provided base URL", async () => {
    const values: Record<string, string> = {
      OPENAI_API_KEY: "netlify-gateway-key",
      OPENAI_BASE_URL: "https://gateway.example.test/openai",
    };
    vi.stubGlobal("Netlify", {
      env: { get: vi.fn((key: string) => values[key]) },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(
      responsesPayload("تم الاتصال", "gpt-5.6-sol"),
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(isOpenAiConfigured()).toBe(true);
    await expect(generateOpenAiText({
      instructions: "تعليمات",
      input: "اختبار",
      maxOutputTokens: 300,
    })).resolves.toEqual({
      text: "تم الاتصال",
      model: "gpt-5.6-sol",
      responseId: "resp_gpt_5_6_sol",
      sources: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.test/openai/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer netlify-gateway-key" }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toEqual(expect.objectContaining({
      model: "gpt-5.6-sol",
      instructions: "تعليمات",
      input: "اختبار",
      reasoning: { effort: "low" },
      max_output_tokens: 300,
      store: false,
    }));
  });

  it("falls back to the direct OpenAI Responses endpoint for local development", async () => {
    vi.stubGlobal("Netlify", {
      env: { get: vi.fn((key: string) => key === "OPENAI_API_KEY" ? "local-key" : undefined) },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(
      responsesPayload("ok", "gpt-5.6-sol"),
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await generateOpenAiText({ instructions: "test", input: "test" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.any(Object),
    );
  });

  it("reads Netlify AI Gateway variables injected into process.env", async () => {
    vi.stubGlobal("Netlify", { env: { get: vi.fn(() => undefined) } });
    vi.stubEnv("OPENAI_API_KEY", "automatic-gateway-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://gateway.netlify.test/openai");
    vi.stubEnv("OPENAI_MODEL", "gpt-5-mini");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(
      responsesPayload("يعمل", "gpt-5-mini"),
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(isOpenAiConfigured()).toBe(true);
    await expect(generateOpenAiText({ instructions: "test", input: "test" }))
      .resolves.toEqual({
        text: "يعمل",
        model: "gpt-5-mini",
        responseId: "resp_gpt_5_mini",
        sources: [],
      });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.netlify.test/openai/v1/responses",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer automatic-gateway-key" }),
      }),
    );
  });

  it("streams text deltas from the Responses API", async () => {
    const values: Record<string, string> = {
      OPENAI_API_KEY: "netlify-gateway-key",
      OPENAI_BASE_URL: "https://gateway.example.test/openai",
    };
    vi.stubGlobal("Netlify", {
      env: { get: vi.fn((key: string) => values[key]) },
    });
    const completed = responsesPayload("تم الاتصال", "gpt-5.6-sol");
    const body = [
      "event: response.output_text.delta",
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "تم " })}`,
      "",
      "event: response.output_text.delta",
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "الاتصال" })}`,
      "",
      "event: response.completed",
      `data: ${JSON.stringify({ type: "response.completed", response: completed })}`,
      "",
    ].join("\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];

    await expect(generateOpenAiTextStream(
      { instructions: "تعليمات", input: "اختبار", reasoningEffort: "none" },
      (delta) => deltas.push(delta),
    )).resolves.toMatchObject({
      text: "تم الاتصال",
      model: "gpt-5.6-sol",
    });
    expect(deltas).toEqual(["تم ", "الاتصال"]);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ stream: true });
  });
});
