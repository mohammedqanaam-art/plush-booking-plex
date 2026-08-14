type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{
        type?: string;
        text?: string;
      }>;
    };
  }>;
};

export type OpenAiTextResult = {
  text: string;
  model: string;
};

const configuredEnv = (key: string) => {
  const netlifyValue = typeof Netlify !== "undefined" ? Netlify.env.get(key) : undefined;
  return (netlifyValue || process.env[key] || "").trim();
};

const configuredModel = () => {
  const value = configuredEnv("OPENAI_MODEL") || "gpt-5-mini";
  return /^[a-zA-Z0-9._-]{2,80}$/.test(value) ? value : "gpt-5-mini";
};

export const isOpenAiConfigured = () => Boolean(configuredEnv("OPENAI_API_KEY"));

const responseText = (data: OpenAiResponse) => {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  return (content || [])
    .filter((item) => typeof item.text === "string")
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
};

const openAiEndpoint = () => {
  const configuredBaseUrl = configuredEnv("OPENAI_BASE_URL") || "https://api.openai.com";
  let parsed: URL;
  try {
    parsed = new URL(configuredBaseUrl);
  } catch {
    parsed = new URL("https://api.openai.com");
  }
  if (parsed.protocol !== "https:") parsed = new URL("https://api.openai.com");
  const baseUrl = parsed.toString().replace(/\/+$/, "");
  return `${baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`}/chat/completions`;
};

export async function generateOpenAiText(options: {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<OpenAiTextResult> {
  const apiKey = configuredEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");

  const model = configuredModel();
  const response = await fetch(openAiEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: options.instructions.slice(0, 12_000) },
        { role: "user", content: options.input.slice(0, 24_000) },
      ],
      max_completion_tokens: Math.min(3_000, Math.max(200, options.maxOutputTokens || 1_200)),
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
