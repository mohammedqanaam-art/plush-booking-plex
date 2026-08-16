export type OfficialSource = {
  title: string;
  url: string;
  snippet: string;
};

const OFFICIAL_ROOTS = [
  "https://boudl.com/ar/brand/boudl",
  "https://boudl.com/ar/hotels",
  "https://boudl.com/ar/brands",
];

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
      "User-Agent": "BHG-Central-Reservation-Knowledge/1.0",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`BOUDL_SOURCE_${response.status}`);
  return (await response.text()).slice(0, 1_200_000);
};

type HotelLink = { title: string; url: string; score: number };

const extractHotelLinks = (html: string, query: string): HotelLink[] => {
  const normalizedQuery = normalizeArabic(query);
  const queryTokens = normalizedQuery.split(" ").filter((token) => token.length >= 2);
  const links = new Map<string, HotelLink>();
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchor.exec(html))) {
    const rawHref = match[1];
    if (!/\/hotel\//i.test(rawHref)) continue;
    let url: URL;
    try {
      url = new URL(rawHref, "https://boudl.com");
    } catch {
      continue;
    }
    if (!allowedOfficialHost(url.hostname.toLowerCase())) continue;

    const title = stripHtml(match[2]).slice(0, 160) || decodeURIComponent(url.pathname.split("/").pop() || "فندق بودل");
    const haystack = normalizeArabic(`${title} ${decodeURIComponent(url.pathname)}`);
    let score = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) score += token.length >= 5 ? 4 : 2;
    }
    if (/بودل|boudl/i.test(haystack)) score += 1;
    if (score <= 0) continue;

    const existing = links.get(url.toString());
    if (!existing || existing.score < score) {
      links.set(url.toString(), { title, url: url.toString(), score });
    }
  }

  return [...links.values()].sort((a, b) => b.score - a.score).slice(0, 3);
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

  // The normalized string doesn't preserve exact offsets perfectly, so use a generous section.
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

export async function lookupOfficialBoudlSources(query: string): Promise<OfficialSource[]> {
  const indexResults = await Promise.allSettled(OFFICIAL_ROOTS.map(async (url) => ({ url, html: await fetchOfficialHtml(url) })));
  const successfulIndexes = indexResults
    .filter((result): result is PromiseFulfilledResult<{ url: string; html: string }> => result.status === "fulfilled")
    .map((result) => result.value);

  const candidates = successfulIndexes
    .flatMap((item) => extractHotelLinks(item.html, query))
    .sort((a, b) => b.score - a.score)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index)
    .slice(0, 3);

  const hotelResults = await Promise.allSettled(candidates.map(async (candidate) => {
    const html = await fetchOfficialHtml(candidate.url);
    const text = stripHtml(html);
    return {
      title: candidate.title || text.match(/(?:فندق|بودل)\s+[^|]{2,80}/)?.[0] || "مصدر بودل الرسمي",
      url: candidate.url,
      snippet: snippetForQuery(text, query),
    } satisfies OfficialSource;
  }));

  const sources = hotelResults
    .filter((result): result is PromiseFulfilledResult<OfficialSource> => result.status === "fulfilled")
    .map((result) => result.value);

  if (sources.length) return sources;

  const brandPage = successfulIndexes.find((item) => item.url.includes("/brand/boudl")) || successfulIndexes[0];
  if (!brandPage) return [];
  return [{
    title: "بودل - الموقع الرسمي",
    url: brandPage.url,
    snippet: snippetForQuery(stripHtml(brandPage.html), query),
  }];
}
