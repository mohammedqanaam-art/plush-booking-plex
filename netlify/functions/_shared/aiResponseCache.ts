import { createHash } from "node:crypto";
import { getEnvironmentStore } from "./storage";

export type CachedAiSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type CachedAiResponse = {
  reply: string;
  sources: CachedAiSource[];
  model?: string | null;
  provider: string;
  createdAt: string;
  knowledgeUpdatedAt?: string;
};

const CACHE_TTL_MS = 30 * 60 * 1000;

const cacheStore = () => getEnvironmentStore("ai-response-cache");

const normalizedPart = (value: unknown) => String(value || "")
  .toLocaleLowerCase("ar")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 3_000);

export const aiResponseCacheKey = (
  scope: "visitor" | "admin",
  message: string,
  history: Array<{ role: string; content: string }> = [],
) => {
  const context = history
    .slice(-4)
    .map((item) => `${item.role}:${normalizedPart(item.content)}`)
    .join("|");
  return `${scope}/${createHash("sha256")
    .update(`${normalizedPart(message)}|${context}`)
    .digest("hex")}`;
};

export const isCacheSafeConversation = (
  message: string,
  history: Array<{ content: string }> = [],
) => ![message, ...history.map((item) => item.content)]
  .some((value) => /\[[^\]]*محجوب\]/u.test(value));

export const readCachedAiResponse = async (key: string): Promise<CachedAiResponse | null> => {
  try {
    const value = await cacheStore().get(key, { type: "json" }) as CachedAiResponse | null;
    if (!value?.reply || !value.createdAt) return null;
    const createdAt = Date.parse(value.createdAt);
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > CACHE_TTL_MS) {
      await cacheStore().delete(key).catch(() => undefined);
      return null;
    }
    return {
      ...value,
      reply: String(value.reply).slice(0, 7_000),
      sources: Array.isArray(value.sources) ? value.sources.slice(0, 6) : [],
    };
  } catch {
    return null;
  }
};

export const writeCachedAiResponse = async (
  key: string,
  value: Omit<CachedAiResponse, "createdAt">,
) => {
  const safe: CachedAiResponse = {
    ...value,
    reply: String(value.reply || "").slice(0, 7_000),
    sources: Array.isArray(value.sources)
      ? value.sources.slice(0, 6).map((source) => ({
          title: String(source.title || "مصدر BHG").slice(0, 180),
          url: String(source.url || "").slice(0, 700),
          ...(source.snippet ? { snippet: String(source.snippet).slice(0, 700) } : {}),
        }))
      : [],
    createdAt: new Date().toISOString(),
  };
  await cacheStore().setJSON(key, safe).catch(() => undefined);
};
