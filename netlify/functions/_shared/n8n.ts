type N8nPayload = Record<string, unknown>;

export type N8nAgentReply = {
  reply?: string;
  output?: string;
  text?: string;
  message?: string;
  response?: string;
  sources?: Array<{ title?: string; url?: string; snippet?: string }>;
  actions?: Array<Record<string, unknown>>;
  traceId?: string;
  [key: string]: unknown;
};

const privateIpv4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

const configuredUrl = (envKey: string): URL | null => {
  const raw = Netlify.env.get(envKey)?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${envKey}_INVALID_URL`);
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${envKey}_HTTPS_REQUIRED`);
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || privateIpv4.test(host)) {
    throw new Error(`${envKey}_PRIVATE_HOST_REJECTED`);
  }

  return url;
};

const requestSecret = () => Netlify.env.get("N8N_AGENT_SHARED_SECRET")?.trim() || "";

const extractText = (data: N8nAgentReply | string): string => {
  if (typeof data === "string") return data.trim();
  for (const key of ["reply", "output", "text", "message", "response"] as const) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

export const n8nAgentConfigured = () => Boolean(Netlify.env.get("N8N_AGENT_WEBHOOK_URL")?.trim());

export const callN8nAgent = async (
  payload: N8nPayload,
  options: { timeoutMs?: number; urlEnvKey?: string } = {},
): Promise<{ data: N8nAgentReply | string; reply: string; status: number }> => {
  const envKey = options.urlEnvKey || "N8N_AGENT_WEBHOOK_URL";
  const url = configuredUrl(envKey);
  if (!url) throw new Error(`${envKey}_NOT_CONFIGURED`);

  const requestId = typeof payload.requestId === "string" && payload.requestId
    ? payload.requestId
    : crypto.randomUUID();
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json, text/plain;q=0.9",
    "X-BHG-Request-Id": requestId,
    "X-BHG-Agent-Version": "1",
  });
  const secret = requestSecret();
  if (secret) headers.set("X-BHG-Agent-Key", secret);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, requestId }),
    signal: AbortSignal.timeout(Math.min(45_000, Math.max(4_000, options.timeoutMs || 25_000))),
  });

  const contentType = response.headers.get("content-type") || "";
  let data: N8nAgentReply | string;
  if (contentType.includes("application/json")) {
    data = await response.json() as N8nAgentReply;
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw new Error(`N8N_UPSTREAM_${response.status}`);
  }

  return { data, reply: extractText(data), status: response.status };
};

export const callConfiguredN8nWebhook = async (
  envKey: string,
  req: Request,
  body?: ArrayBuffer,
): Promise<Response> => {
  const base = configuredUrl(envKey);
  if (!base) throw new Error(`${envKey}_NOT_CONFIGURED`);

  const incoming = new URL(req.url);
  base.search = incoming.search;
  const headers = new Headers();
  for (const name of ["content-type", "accept", "user-agent", "x-hub-signature-256"] as const) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("X-BHG-Webhook-Proxy", "netlify");
  headers.set("X-BHG-Request-Id", crypto.randomUUID());
  const secret = requestSecret();
  if (secret) headers.set("X-BHG-Agent-Key", secret);

  const upstream = await fetch(base, {
    method: req.method,
    headers,
    body: req.method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(25_000),
  });

  const responseHeaders = new Headers({ "Cache-Control": "no-store" });
  const type = upstream.headers.get("content-type");
  if (type) responseHeaders.set("Content-Type", type);
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
};
