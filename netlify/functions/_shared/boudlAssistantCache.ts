import { createHash } from "node:crypto";
import { getEnvironmentStore } from "./storage";

export type CachedBoudlAnswer = {
  reply: string;
  model: string | null;
  sources: Array<{ title: string; url: string; snippet?: string }>;
  cachedAt: string;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_READ_TIMEOUT_MS = 650;
const HOT_CACHE_LIMIT = 80;
const hotCache = new Map<string, CachedBoudlAnswer>();
const changingFactPattern = /(?:سعر|اسعار|الاسعار|متاح|متوفر|توفر|توافر|اليوم|الليله|غدا|غدًا|price|prices|rate|rates|available|availability|today|tonight|tomorrow)/i;

const normalizedQuestion = (value: string) => value
  .toLocaleLowerCase("ar")
  .normalize("NFKD")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

export const isCacheableBoudlQuestion = (message: string, hasConversationContext: boolean) => {
  const normalized = normalizedQuestion(message);
  return Boolean(normalized && !hasConversationContext && !changingFactPattern.test(normalized));
};

const cacheKey = (message: string) => `answer-${createHash("sha256").update(normalizedQuestion(message)).digest("hex")}`;

const isFresh = (cached: CachedBoudlAnswer | null | undefined) => {
  if (!cached?.reply || !Array.isArray(cached.sources) || !cached.sources.length) return false;
  const age = Date.now() - new Date(cached.cachedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
};

const remember = (key: string, value: CachedBoudlAnswer) => {
  hotCache.delete(key);
  hotCache.set(key, value);
  if (hotCache.size > HOT_CACHE_LIMIT) {
    const oldest = hotCache.keys().next().value;
    if (oldest) hotCache.delete(oldest);
  }
};

export const readCachedBoudlAnswer = async (message: string): Promise<CachedBoudlAnswer | null> => {
  const key = cacheKey(message);
  const inMemory = hotCache.get(key);
  if (isFresh(inMemory)) return inMemory || null;
  hotCache.delete(key);

  const stored = getEnvironmentStore("assistant-cache")
    .get(key, { type: "json" }).catch(() => null) as Promise<CachedBoudlAnswer | null>;
  const cached = await Promise.race([
    stored,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), CACHE_READ_TIMEOUT_MS)),
  ]);
  if (!isFresh(cached)) return null;
  remember(key, cached as CachedBoudlAnswer);
  return cached;
};

export const writeCachedBoudlAnswer = async (message: string, answer: Omit<CachedBoudlAnswer, "cachedAt">) => {
  if (!answer.reply.trim() || !answer.sources.length) return;
  const key = cacheKey(message);
  const cached = {
    ...answer,
    cachedAt: new Date().toISOString(),
  } satisfies CachedBoudlAnswer;
  remember(key, cached);
  await getEnvironmentStore("assistant-cache").setJSON(key, cached);
};
