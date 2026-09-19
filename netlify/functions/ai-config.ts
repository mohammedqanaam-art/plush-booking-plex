import type { Config } from "@netlify/functions";
import { isOpenAiAvailable } from "./_shared/openai";
import { json, requireSameOrigin, validateSession } from "./_shared/security";
import { getEncryptedEnvironmentStore } from "./_shared/storage";

type StoredOpenAiConfig = {
  apiKey: string;
  model: string;
  updatedAt: string;
  updatedBy: string;
};

const DEFAULT_MODEL = "gpt-5.6-sol";

const cleanModel = (value: unknown) => {
  const model = String(value || DEFAULT_MODEL).trim();
  return /^[a-zA-Z0-9._-]{2,80}$/.test(model) ? model : DEFAULT_MODEL;
};

const validApiKey = (value: unknown) => {
  const key = String(value || "").trim();
  return /^sk-[A-Za-z0-9_-]{20,300}$/.test(key) ? key : "";
};

export default async (req: Request) => {
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (!["superadmin", "admin"].includes(session.role)) return json({ error: "Permission denied" }, 403);

  const store = getEncryptedEnvironmentStore("ai-secrets", { consistency: "strong" });

  if (req.method === "GET") {
    const stored = await store.get<Partial<StoredOpenAiConfig>>("openai", { type: "json" }).catch(() => null);
    return json({
      configured: await isOpenAiAvailable(),
      model: cleanModel(stored?.model || DEFAULT_MODEL),
      updatedAt: stored?.updatedAt || null,
      updatedBy: stored?.updatedBy || null,
      storage: stored?.apiKey ? "encrypted-blob" : "environment-or-none",
    });
  }

  const originError = requireSameOrigin(req);
  if (originError) return originError;

  if (req.method === "PUT") {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 12 * 1024) return json({ error: "Request too large" }, 413);

    const body = await req.json().catch(() => ({})) as { apiKey?: string; model?: string };
    const apiKey = validApiKey(body.apiKey);
    if (!apiKey) return json({ error: "مفتاح OpenAI غير صالح." }, 400);

    const config: StoredOpenAiConfig = {
      apiKey,
      model: cleanModel(body.model),
      updatedAt: new Date().toISOString(),
      updatedBy: session.username,
    };
    await store.setJSON("openai", config);

    return json({
      ok: true,
      configured: true,
      model: config.model,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    });
  }

  if (req.method === "DELETE") {
    if (session.role !== "superadmin") return json({ error: "Superadmin required" }, 403);
    await store.delete("openai");
    return json({ ok: true, configured: false, model: DEFAULT_MODEL });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  path: "/api/admin/ai-config",
  rateLimit: {
    windowLimit: 12,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
