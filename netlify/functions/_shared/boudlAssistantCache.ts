import { createHash } from "node:crypto";
import { getEnvironmentStore } from "./storage";

export type CachedBoudlAnswer = {
  reply: string;
  model: string | null;
  sources: Array<{ title: string; url: string; snippet?: string }>;
  cachedAt: string;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
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

export const readCachedBoudlAnswer = async (message: string): Promise<CachedBoudlAnswer | null> => {
  const cached = await getEnvironmentStore("assistant-cache", { consistency: "strong" })
    .get(cacheKey(message), { type: "json" }).catch(() => null) as CachedBoudlAnswer | null;
  if (!cached?.reply || !Array.isArray(cached.sources) || !cached.sources.length) return null;
  const age = Date.now() - new Date(cached.cachedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS ? cached : null;
};

export const writeCachedBoudlAnswer = async (message: string, answer: Omit<CachedBoudlAnswer, "cachedAt">) => {
  if (!answer.reply.trim() || !answer.sources.length) return;
  await getEnvironmentStore("assistant-cache", { consistency: "strong" }).setJSON(cacheKey(message), {
    ...answer,
    cachedAt: new Date().toISOString(),
  } satisfies CachedBoudlAnswer);
};
