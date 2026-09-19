import { getEnvironmentStore } from "./storage";
import { createHash } from "node:crypto";

export type OfficialSource = {
  title: string;
  url: string;
  snippet: string;
};

export type BranchKnowledgeIndex = {
  updatedAt: string;
  hotelCount: number;
  hotels: Array<{ title: string; url: string }>;
};

const OFFICIAL_ROOTS = [
  "https://boudl.com/ar/brand/boudl",
  "https://boudl.com/ar/hotels",
  "https://boudl.com/ar/brands",
];
const KNOWLEDGE_PAGE_TTL_MS = 24 * 60 * 60 * 1000;
let hotKnowledgeIndex: BranchKnowledgeIndex | null = null;

const allowedOfficialHost = (hostname: string) => (
  hostname === "boudl.com"
  || hostname === "www.boudl.com"
  || hostname === "booking.boudl.com"
);

const normalizeArabic = (value: string) => value
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const htmlEntities = (value: string) => value
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, "\"")
  .replace(/&#39;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const stripHtml = (html: string) => htmlEntities(html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
  .replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ")
  .trim();

const fetchOfficialHtml = async (url: string): Promise<string> => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !allowedOfficialHost(parsed.hostname.toLowerCase())) {
    throw new Error("UNTRUSTED_BOUDL_SOURCE");
  }
  const response = await fetch(parsed, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "BHG-Central-Reservation-Knowledge/1.1",
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`BOUDL_SOURCE_${response.status}`);
  return (await response.text()).slice(0, 1_200_000);
};

type HotelLink = { title: string; url: string; score: number };

const genericQueryTokens = new Set([
  "اقرب", "قريب", "فرع", "فروع", "فندق", "فنادق", "الموقع", "موقع", "خدمات", "الخدمات",
  "في", "من", "الي", "على", "عن", "هل", "ما", "كم", "كيف", "اريد", "احتاج",
  "near", "nearest", "hotel", "hotels", "branch", "branches", "location", "service", "services",
]);

const allHotelLinks = (html: string): Array<{ title: string; url: string }> => {
  const links = new Map<string, { title: string; url: string }>();
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchor.exec(html))) {
    if (!/\/hotel\//i.test(match[1])) continue;
    let url: URL;
    try {
      url = new URL(match[1], "https://boudl.com");
    } catch {
      continue;
    }
    if (!allowedOfficialHost(url.hostname.toLowerCase())) continue;
    url.hash = "";
    const title = stripHtml(match[2]).slice(0, 160)
      || decodeURIComponent(url.pathname.split("/").pop() || "فندق بودل");
    links.set(url.toString(), { title, url: url.toString() });
    if (links.size >= 180) break;
  }

  return [...links.values()];
};

const rankHotelLinks = (links: Array<{ title: string; url: string }>, query: string): HotelLink[] => {
  const normalizedQuery = normalizeArabic(query);
  const queryTokens = normalizedQuery.split(" ")
    .filter((token) => token.length >= 2 && !genericQueryTokens.has(token));
  const queryHasBoudl = /(?:^|\s)(?:بودل|boudl)(?:\s|$)/i.test(normalizedQuery);
  const queryHasBraira = /(?:^|\s)(?:بريرا|برايرا|braira)(?:\s|$)/i.test(normalizedQuery);
  const queryHasAber = /(?:^|\s)(?:عابر|aber)(?:\s|$)/i.test(normalizedQuery);
  const queryHasNarcissus = /(?:^|\s)(?:نارسس|نارسيس|narcissus)(?:\s|$)/i.test(normalizedQuery);
  return links.map((item) => {
    const haystack = normalizeArabic(`${item.title} ${decodeURIComponent(new URL(item.url).pathname)}`);
    let score = 0;
    let matchedTokens = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) {
        score += token.length >= 5 ? 4 : 2;
        matchedTokens += 1;
      }
    }
    if (queryHasBoudl && /بودل|boudl/i.test(haystack)) score += 5;
    if (queryHasBraira && /بريرا|برايرا|braira/i.test(haystack)) score += 5;
    if (queryHasAber && /عابر|aber/i.test(haystack)) score += 5;
    if (queryHasNarcissus && /نارسس|نارسيس|narcissus/i.test(haystack)) score += 5;
    return { ...item, score, matchedTokens };
  }).filter((item) => item.matchedTokens > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ matchedTokens: _matchedTokens, ...item }) => item);
};

const snippetForQuery = (text: string, query: string) => {
  const clean = text.slice(0, 40_000);
  const tokens = normalizeArabic(query).split(" ").filter((token) => token.length >= 3);
  const normalizedText = normalizeArabic(clean);
  let index = -1;
  for (const token of tokens) {
    index = normalizedText.indexOf(token);
    if (index >= 0) break;
  }
  if (index < 0) return clean.slice(0, 1_800);
  const roughStart = Math.max(0, Math.floor(index * (clean.length / Math.max(1, normalizedText.length))) - 500);
  return clean.slice(roughStart, roughStart + 2_400);
};

export const isOfficialBoudlUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedOfficialHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export async function refreshOfficialBoudlKnowledgeIndex(): Promise<BranchKnowledgeIndex> {
  const rootResults = await Promise.allSettled(OFFICIAL_ROOTS.map(fetchOfficialHtml));
  const links = new Map<string, { title: string; url: string }>();
  for (const result of rootResults) {
    if (result.status !== "fulfilled") continue;
    for (const hotel of allHotelLinks(result.value)) links.set(hotel.url, hotel);
  }
  if (!links.size) throw new Error("BOUDL_INDEX_UNAVAILABLE");

  const index: BranchKnowledgeIndex = {
    updatedAt: new Date().toISOString(),
    hotelCount: links.size,
    hotels: [...links.values()].sort((a, b) => a.title.localeCompare(b.title, "ar")),
  };
  hotKnowledgeIndex = index;
  await getEnvironmentStore("branch-knowledge", { consistency: "strong" }).setJSON("official-index", index);
  return index;
}

export async function getOfficialBoudlKnowledgeStatus(): Promise<BranchKnowledgeIndex | null> {
  if (hotKnowledgeIndex) return hotKnowledgeIndex;
  const stored = await getEnvironmentStore("branch-knowledge", { consistency: "strong" })
    .get("official-index", { type: "json" }) as BranchKnowledgeIndex | null;
  if (!stored || !Array.isArray(stored.hotels)) return null;
  hotKnowledgeIndex = stored;
  return stored;
}

const getKnowledgeIndex = async (): Promise<BranchKnowledgeIndex | null> => {
  try {
    const cached = await getOfficialBoudlKnowledgeStatus();
    // Index refresh runs separately. Serving the last verified official index avoids
    // making a visitor wait for three website downloads whenever the TTL expires.
    if (cached) return cached;
    return await refreshOfficialBoudlKnowledgeIndex();
  } catch {
    return getOfficialBoudlKnowledgeStatus().catch(() => null);
  }
};

type CachedOfficialPage = OfficialSource & { fetchedAt: string; text: string };

const officialPageCacheKey = (url: string) => `page-${createHash("sha256").update(url).digest("hex")}`;

const officialSourceForUrl = async (url: string, title: string, query: string): Promise<OfficialSource> => {
  const store = getEnvironmentStore("branch-knowledge", { consistency: "strong" });
  const key = officialPageCacheKey(url);
  const cached = await store.get(key, { type: "json" }).catch(() => null) as CachedOfficialPage | null;
  const cachedAge = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Number.POSITIVE_INFINITY;
  if (cached?.text && Number.isFinite(cachedAge) && cachedAge >= 0 && cachedAge < KNOWLEDGE_PAGE_TTL_MS) {
    return { title: cached.title || title, url, snippet: snippetForQuery(cached.text, query) };
  }

  try {
    const text = stripHtml(await fetchOfficialHtml(url));
    const page: CachedOfficialPage = {
      title: title || text.match(/(?:فندق|بودل)\s+[^|]{2,80}/)?.[0] || "مصدر بودل الرسمي",
      url,
      snippet: "",
      text: text.slice(0, 120_000),
      fetchedAt: new Date().toISOString(),
    };
    await store.setJSON(key, page).catch(() => undefined);
    return { title: page.title, url, snippet: snippetForQuery(page.text, query) };
  } catch (error) {
    if (cached?.text) return { title: cached.title || title, url, snippet: snippetForQuery(cached.text, query) };
    throw error;
  }
};

export async function lookupOfficialBoudlSources(query: string): Promise<OfficialSource[]> {
  const index = await getKnowledgeIndex();
  let candidates = index ? rankHotelLinks(index.hotels, query) : [];

  if (!candidates.length && !index) {
    const indexResults = await Promise.allSettled(OFFICIAL_ROOTS.map(async (url) => ({ url, html: await fetchOfficialHtml(url) })));
    const successfulIndexes = indexResults
      .filter((result): result is PromiseFulfilledResult<{ url: string; html: string }> => result.status === "fulfilled")
      .map((result) => result.value);
    const liveLinks = successfulIndexes.flatMap((item) => allHotelLinks(item.html));
    candidates = rankHotelLinks(liveLinks, query);
  }

  const hotelResults = await Promise.allSettled(candidates.map((candidate) => (
    officialSourceForUrl(candidate.url, candidate.title, query)
  )));

  const sources = hotelResults
    .filter((result): result is PromiseFulfilledResult<OfficialSource> => result.status === "fulfilled")
    .map((result) => result.value);
  if (sources.length) return sources;

  // A generic root page is not evidence for a specific branch, landmark, or
  // distance. Returning no source lets the Responses API perform a scoped
  // official-site search instead of grounding an answer in unrelated text.
  return [];
}
