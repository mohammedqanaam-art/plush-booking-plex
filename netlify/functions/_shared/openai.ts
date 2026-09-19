import { getEncryptedEnvironmentStore } from "./storage";

type UrlCitation = {
  type?: string;
  title?: string;
  url?: string;
};

type ResponseContent = {
  type?: string;
  text?: string;
  annotations?: UrlCitation[];
};

type ResponseOutputItem = {
  type?: string;
  content?: ResponseContent[];
};

type OpenAiResponse = {
  id?: string;
  model?: string;
  output?: ResponseOutputItem[];
};

type StoredOpenAiConfig = {
  apiKey?: string;
  model?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type OpenAiSource = {
  title: string;
  url: string;
};

export type OpenAiTextResult = {
  text: string;
  model: string;
  responseId?: string;
  sources: OpenAiSource[];
};

export type OpenAiTextOptions = {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  webSearchAllowedDomains?: string[];
};

const DEFAULT_MODEL = "gpt-5.6-sol";

const configuredEnv = (key: string) => {
  const netlifyValue = typeof Netlify !== "undefined" ? Netlify.env.get(key) : undefined;
  return (netlifyValue || process.env[key] || "").trim();
};

const safeModel = (value: string | undefined) => {
  const candidate = String(value || "").trim();
  return /^[a-zA-Z0-9._-]{2,80}$/.test(candidate) ? candidate : DEFAULT_MODEL;
};

const loadStoredOpenAiConfig = async (): Promise<StoredOpenAiConfig | null> => {
  try {
    const store = getEncryptedEnvironmentStore("ai-secrets", { consistency: "strong" });
    return await store.get<StoredOpenAiConfig>("openai", { type: "json" });
  } catch (error) {
    console.error("[openai] encrypted config read failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return null;
  }
};

const resolveOpenAiConfig = async () => {
  const envKey = configuredEnv("OPENAI_API_KEY");
  const envModel = configuredEnv("OPENAI_MODEL");
  if (envKey) return { apiKey: envKey, model: safeModel(envModel || DEFAULT_MODEL) };

  const stored = await loadStoredOpenAiConfig();
  return {
    apiKey: String(stored?.apiKey || "").trim(),
    model: safeModel(envModel || stored?.model || DEFAULT_MODEL),
  };
};

// Kept for legacy synchronous checks. New code should prefer isOpenAiAvailable().
export const isOpenAiConfigured = () => Boolean(configuredEnv("OPENAI_API_KEY"));

export const isOpenAiAvailable = async () => {
  const config = await resolveOpenAiConfig();
  return Boolean(config.apiKey);
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
  return `${baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`}/responses`;
};

const responseTextAndSources = (data: OpenAiResponse) => {
  const text: string[] = [];
  const sources = new Map<string, OpenAiSource>();

  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        text.push(content.text.trim());
      }
      for (const annotation of content.annotations || []) {
        if (annotation.type !== "url_citation") continue;
        const url = String(annotation.url || "").trim();
        if (!url || !/^https:\/\//i.test(url)) continue;
        sources.set(url, {
          title: String(annotation.title || new URL(url).hostname).slice(0, 180),
          url,
        });
      }
    }
  }

  return {
    text: text.filter(Boolean).join("\n").trim(),
    sources: [...sources.values()].slice(0, 8),
  };
};

const requestOpenAi = async (options: OpenAiTextOptions, stream: boolean) => {
  const config = await resolveOpenAiConfig();
  if (!config.apiKey) throw new Error("OPENAI_NOT_CONFIGURED");

  const allowedDomains = (options.webSearchAllowedDomains || [])
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => /^[a-z0-9.-]+$/.test(domain))
    .slice(0, 20);

  const body: Record<string, unknown> = {
    model: config.model,
    instructions: options.instructions.slice(0, 16_000),
    input: options.input.slice(0, 32_000),
    reasoning: { effort: options.reasoningEffort || "low" },
    max_output_tokens: Math.min(4_000, Math.max(200, options.maxOutputTokens || 1_200)),
    store: false,
  };
  if (stream) body.stream = true;

  if (allowedDomains.length) {
    body.tools = [{
      type: "web_search",
      filters: { allowed_domains: allowedDomains },
      search_context_size: "medium",
    }];
  }

  const response = await fetch(openAiEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.min(55_000, Math.max(5_000, options.timeoutMs || 30_000))),
  });

  if (!response.ok) {
    console.error("OpenAI Responses request failed", {
      status: response.status,
      requestId: response.headers.get("x-request-id") || undefined,
    });
    throw new Error(`OPENAI_UPSTREAM_${response.status}`);
  }

  return { response, configuredModel: config.model };
};

export async function generateOpenAiText(options: OpenAiTextOptions): Promise<OpenAiTextResult> {
  const { response, configuredModel } = await requestOpenAi(options, false);

  const data = await response.json() as OpenAiResponse;
  const parsed = responseTextAndSources(data);
  if (!parsed.text) throw new Error("OPENAI_EMPTY_RESPONSE");
  return {
    text: parsed.text,
    model: String(data.model || configuredModel),
    responseId: data.id,
    sources: parsed.sources,
  };
}

type OpenAiStreamEvent = {
  type?: string;
  delta?: string;
  response?: OpenAiResponse;
};

const sseData = (block: string) => block
  .split(/\r?\n/)
  .filter((line) => line.startsWith("data:"))
  .map((line) => line.slice(5).trimStart())
  .join("\n")
  .trim();

export async function generateOpenAiTextStream(
  options: OpenAiTextOptions,
  onDelta: (delta: string) => void,
): Promise<OpenAiTextResult> {
  const { response, configuredModel } = await requestOpenAi(options, true);
  const contentType = response.headers.get("content-type") || "";

  if (!response.body || !contentType.includes("text/event-stream")) {
    const data = await response.json() as OpenAiResponse;
    const parsed = responseTextAndSources(data);
    if (!parsed.text) throw new Error("OPENAI_EMPTY_RESPONSE");
    onDelta(parsed.text);
    return {
      text: parsed.text,
      model: String(data.model || configuredModel),
      responseId: data.id,
      sources: parsed.sources,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let completed: OpenAiResponse | undefined;

  const processBlock = (block: string) => {
    const raw = sseData(block);
    if (!raw || raw === "[DONE]") return;

    let event: OpenAiStreamEvent;
    try {
      event = JSON.parse(raw) as OpenAiStreamEvent;
    } catch {
      return;
    }

    if (event.type === "response.output_text.delta" && typeof event.delta === "string" && event.delta) {
      accumulated += event.delta;
      onDelta(event.delta);
      return;
    }
    if (event.type === "response.completed" && event.response) {
      completed = event.response;
      return;
    }
    if (event.type === "error" || event.type === "response.failed" || event.type === "response.incomplete") {
      throw new Error("OPENAI_STREAM_FAILED");
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) processBlock(block);
  }
  buffer += decoder.decode();
  if (buffer.trim()) processBlock(buffer);

  const parsed = completed ? responseTextAndSources(completed) : { text: "", sources: [] as OpenAiSource[] };
  const text = parsed.text || accumulated.trim();
  if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");

  if (!accumulated) onDelta(text);
  else if (text.startsWith(accumulated) && text.length > accumulated.length) onDelta(text.slice(accumulated.length));

  return {
    text,
    model: String(completed?.model || configuredModel),
    responseId: completed?.id,
    sources: parsed.sources,
  };
}
