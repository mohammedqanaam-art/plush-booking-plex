type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

export type OpenAiTextResult = {
  text: string;
  model: string;
};

const configuredModel = () => {
  const value = Netlify.env.get("OPENAI_MODEL")?.trim() || "gpt-5-mini";
  return /^[a-zA-Z0-9._-]{2,80}$/.test(value) ? value : "gpt-5-mini";
};

export const isOpenAiConfigured = () => Boolean(Netlify.env.get("OPENAI_API_KEY")?.trim());

const responseText = (data: OpenAiResponse) => {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
};

export async function generateOpenAiText(options: {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<OpenAiTextResult> {
  const apiKey = Netlify.env.get("OPENAI_API_KEY")?.trim();
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");

  const model = configuredModel();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: options.instructions.slice(0, 12_000),
      input: options.input.slice(0, 24_000),
      max_output_tokens: Math.min(3_000, Math.max(200, options.maxOutputTokens || 1_200)),
      store: false,
    }),
    signal: AbortSignal.timeout(Math.min(50_000, Math.max(5_000, options.timeoutMs || 28_000))),
  });

  if (!response.ok) {
    console.error("OpenAI request failed", { status: response.status, requestId: response.headers.get("x-request-id") || undefined });
    throw new Error(`OPENAI_UPSTREAM_${response.status}`);
  }

  const data = await response.json() as OpenAiResponse;
  const text = responseText(data);
  if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");
  return { text, model };
}
