import { getEnvironmentStore } from "./storage";

export type KnowledgeSourceKind = "boudl" | "sheet" | "booking";

export type OfficialSource = {
  title: string;
  url: string;
  snippet: string;
  sourceKind?: KnowledgeSourceKind;
  verifiedAt?: string;
};

type KnowledgeDocument = {
  title: string;
  url: string;
  content: string;
  sourceKind: KnowledgeSourceKind;
};

export type BranchKnowledgeIndex = {
  version?: number;
  updatedAt: string;
  hotelCount: number;
  documentCount?: number;
  sourceCounts?: Record<KnowledgeSourceKind, number>;
  hotels: Array<{ title: string; url: string }>;
  documents?: KnowledgeDocument[];
};

export type KnowledgeScope = "public" | "internal";

const OFFICIAL_ROOTS = [
  "https://boudl.com/ar/brand/boudl",
  "https://boudl.com/ar/hotels",
  "https://boudl.com/ar/brands",
];
const INTERNAL_KNOWLEDGE_URL = "https://www.res-dashbord.com/admin/knowledge-bank";
const MAX_SOURCE_BYTES = 1_200_000;
const MAX_DOCUMENT_CHARS = 16_000;
const MAX_HOTEL_PAGES = 140;

const allowedBoudlHost = (hostname: string) => (
  hostname === "boudl.com"
  || hostname === "www.boudl.com"
  || hostname === "booking.boudl.com"
);

const allowedBookingHost = (hostname: string) => (
  hostname === "booking.com" || hostname.endsWith(".booking.com")
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

const pageTitle = (html: string, fallback: string) => {
  const matched = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(matched?.[1] || "").slice(0, 180) || fallback;
};

const fetchHtml = async (value: string, sourceKind: "boudl" | "booking") => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const trusted = sourceKind === "boudl" ? allowedBoudlHost(hostname) : allowedBookingHost(hostname);
  if (url.protocol !== "https:" || !trusted || url.username || url.password) {
    throw new Error("UNTRUSTED_BHG_SOURCE");
  }
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "BHG-Central-Reservation-Knowledge/2.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`BHG_SOURCE_${response.status}`);
  return (await response.text()).slice(0, MAX_SOURCE_BYTES);
};

const configuredSheetCsvUrl = () => {
  const raw = Netlify.env.get("BHG_BRANCH_SHEET_CSV_URL")?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:"
      || url.hostname.toLowerCase() !== "docs.google.com"
      || !/^\/spreadsheets\/d\/[a-zA-Z0-9_-]+\/export$/i.test(url.pathname)
      || url.searchParams.get("format") !== "csv"
      || url.username
      || url.password
    ) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
};

const configuredBookingUrls = () => {
  const raw = Netlify.env.get("BHG_BOOKING_PROPERTY_URLS") || "";
  const urls = new Map<string, URL>();
  for (const value of raw.split(/[\n,]+/)) {
    try {
      const url = new URL(value.trim());
      if (
        url.protocol !== "https:"
        || !allowedBookingHost(url.hostname.toLowerCase())
        || url.username
        || url.password
      ) continue;
      url.hash = "";
      urls.set(url.toString(), url);
    } catch {
      // Ignore malformed or unapproved entries.
    }
  }
  return [...urls.values()].slice(0, 100);
};

type HotelLink = { title: string; url: string };

const allHotelLinks = (html: string): HotelLink[] => {
  const links = new Map<string, HotelLink>();
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html))) {
    if (!/\/hotel\//i.test(match[1])) continue;
    try {
      const url = new URL(match[1], "https://boudl.com");
      if (!allowedBoudlHost(url.hostname.toLowerCase())) continue;
      url.hash = "";
      const title = stripHtml(match[2]).slice(0, 160)
        || decodeURIComponent(url.pathname.split("/").pop() || "فندق BHG");
      links.set(url.toString(), { title, url: url.toString() });
      if (links.size >= MAX_HOTEL_PAGES) break;
    } catch {
      // Ignore malformed links returned by a page.
    }
  }
  return [...links.values()];
};

const parseCsv = (csv: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === "\"" && csv[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") quoted = false;
      else value += char;
      continue;
    }
    if (char === "\"") quoted = true;
    else if (char === ",") {
      row.push(value.trim());
      value = "";
    } else if (char === "\n") {
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const SAFE_SHEET_HEADERS = [
  /الفروع|اسم الفرع/i,
  /الإفطار|الافطار/i,
  /مسبح/i,
  /كوفي/i,
  /المطعم/i,
  /اطلالة|إطلالة|بلكونه|بلكونة/i,
  /مواقف/i,
  /قاعة/i,
  /النادى|النادي/i,
  /غسيل الملابس/i,
  /جلسات خارجية/i,
  /سبا/i,
  /جاكوزي|بانيو/i,
  /الأطفال|الاطفال/i,
];

const FORBIDDEN_SHEET_HEADER = /مدير|موظف|جوال|هاتف|رقم|بريد|ايميل|إيميل|كلمة|مرور|حجز|سعر|بكج|راتب|هوية|بطاقة|UNO|OPERA/i;

const sheetDocuments = (csv: string, verifiedAt: string): KnowledgeDocument[] => {
  const rows = parseCsv(csv.slice(0, MAX_SOURCE_BYTES));
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.replace(/\s+/g, " ").trim());
  const allowedColumns = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => !FORBIDDEN_SHEET_HEADER.test(header))
    .filter(({ header }) => SAFE_SHEET_HEADERS.some((pattern) => pattern.test(header)));
  const branchColumn = allowedColumns.find(({ header }) => /الفروع|اسم الفرع/i.test(header))?.index ?? 0;

  return rows.slice(1, 500).flatMap((cells) => {
    const title = String(cells[branchColumn] || "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!title || /^[-_*\s]+$/.test(title)) return [];
    const facts = allowedColumns
      .filter(({ index }) => index !== branchColumn)
      .map(({ header, index }) => ({
        header,
        value: String(cells[index] || "").replace(/\s+/g, " ").trim(),
      }))
      .filter(({ value }) => value && !/^[-_*\s]+$/.test(value))
      .map(({ header, value }) => `${header}: ${value}`);
    if (!facts.length) return [];
    return [{
      title: `${title} · الشيت التشغيلي المعتمد`,
      url: INTERNAL_KNOWLEDGE_URL,
      content: `الفرع: ${title}. ${facts.join(". ")}. تاريخ التحقق: ${verifiedAt}.`.slice(0, MAX_DOCUMENT_CHARS),
      sourceKind: "sheet" as const,
    }];
  });
};

const mapLimit = async <T, R>(items: T[], limit: number, task: (item: T) => Promise<R | null>) => {
  const results: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await task(items[index]);
      } catch {
        results[index] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results.filter((item): item is R => item !== null);
};

const sourceCounts = (documents: KnowledgeDocument[]) => ({
  boudl: documents.filter((document) => document.sourceKind === "boudl").length,
  sheet: documents.filter((document) => document.sourceKind === "sheet").length,
  booking: documents.filter((document) => document.sourceKind === "booking").length,
});

const branchTokens = (titles: string[]) => {
  const tokens = new Set<string>();
  for (const title of titles) {
    const normalized = normalizeArabic(title);
    if (normalized.length >= 4) tokens.add(normalized);
  }
  return [...tokens];
};

const belongsToBHG = (text: string, knownBranchTokens: string[]) => {
  const normalized = normalizeArabic(text.slice(0, MAX_DOCUMENT_CHARS));
  return knownBranchTokens.some((branch) => normalized.includes(branch));
};

export const isOfficialBoudlUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedBoudlHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export async function refreshOfficialBoudlKnowledgeIndex(): Promise<BranchKnowledgeIndex> {
  const verifiedAt = new Date().toISOString();
  const [rootResults, sheetResult] = await Promise.all([
    Promise.allSettled(OFFICIAL_ROOTS.map(async (url) => ({ url, html: await fetchHtml(url, "boudl") }))),
    (async () => {
      const url = configuredSheetCsvUrl();
      if (!url) return [] as KnowledgeDocument[];
      const response = await fetch(url, {
        headers: { Accept: "text/csv", "User-Agent": "BHG-Central-Reservation-Knowledge/2.0" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`BHG_SHEET_${response.status}`);
      return sheetDocuments(await response.text(), verifiedAt);
    })().catch(() => [] as KnowledgeDocument[]),
  ]);

  const roots = rootResults
    .filter((result): result is PromiseFulfilledResult<{ url: string; html: string }> => result.status === "fulfilled")
    .map((result) => result.value);
  const hotelMap = new Map<string, HotelLink>();
  for (const root of roots) {
    for (const hotel of allHotelLinks(root.html)) hotelMap.set(hotel.url, hotel);
  }
  const hotels = [...hotelMap.values()].slice(0, MAX_HOTEL_PAGES);

  const rootDocuments: KnowledgeDocument[] = roots.map((root) => ({
    title: pageTitle(root.html, "مجموعة بودل للضيافة"),
    url: root.url,
    content: stripHtml(root.html).slice(0, MAX_DOCUMENT_CHARS),
    sourceKind: "boudl",
  }));
  const hotelDocuments = await mapLimit(hotels, 8, async (hotel) => {
    const html = await fetchHtml(hotel.url, "boudl");
    const text = stripHtml(html);
    if (!text) return null;
    return {
      title: pageTitle(html, hotel.title),
      url: hotel.url,
      content: text.slice(0, MAX_DOCUMENT_CHARS),
      sourceKind: "boudl" as const,
    };
  });

  const knownTitles = [
    ...hotels.map((hotel) => hotel.title),
    ...sheetResult.map((document) => document.title.replace(/ ·.+$/, "")),
  ];
  const knownBranchTokens = branchTokens(knownTitles);
  const bookingDocuments = await mapLimit(configuredBookingUrls(), 5, async (url) => {
    const html = await fetchHtml(url.toString(), "booking");
    const text = stripHtml(html);
    if (!text || !belongsToBHG(text, knownBranchTokens)) return null;
    return {
      title: pageTitle(html, "Booking.com · فرع BHG"),
      url: url.toString(),
      content: text.slice(0, MAX_DOCUMENT_CHARS),
      sourceKind: "booking" as const,
    };
  });

  const documents = [...rootDocuments, ...hotelDocuments, ...sheetResult, ...bookingDocuments];
  if (!documents.length) throw new Error("BHG_KNOWLEDGE_UNAVAILABLE");

  const index: BranchKnowledgeIndex = {
    version: 2,
    updatedAt: verifiedAt,
    hotelCount: hotels.length,
    documentCount: documents.length,
    sourceCounts: sourceCounts(documents),
    hotels: hotels.sort((left, right) => left.title.localeCompare(right.title, "ar")),
    documents,
  };
  await getEnvironmentStore("branch-knowledge", { consistency: "strong" }).setJSON("official-index", index);
  return index;
}

export async function getOfficialBoudlKnowledgeStatus(): Promise<BranchKnowledgeIndex | null> {
  const stored = await getEnvironmentStore("branch-knowledge", { consistency: "strong" })
    .get("official-index", { type: "json" }) as BranchKnowledgeIndex | null;
  if (!stored || !Array.isArray(stored.hotels)) return null;
  return stored;
}

const getKnowledgeIndex = async () => {
  const cached = await getOfficialBoudlKnowledgeStatus().catch(() => null);
  if (cached?.documents?.length) return cached;
  return refreshOfficialBoudlKnowledgeIndex().catch(() => cached);
};

const rankDocuments = (
  documents: KnowledgeDocument[],
  query: string,
  scope: KnowledgeScope,
) => {
  const normalizedQuery = normalizeArabic(query);
  const queryTokens = normalizedQuery.split(" ").filter((token) => token.length >= 2);
  return documents
    .filter((document) => scope === "internal" || document.sourceKind !== "sheet")
    .map((document) => {
      const title = normalizeArabic(document.title);
      const haystack = normalizeArabic(`${document.title} ${document.content}`);
      let score = 0;
      if (title && normalizedQuery.includes(title)) score += 24;
      for (const token of queryTokens) {
        if (title.includes(token)) score += token.length >= 5 ? 8 : 4;
        else if (haystack.includes(token)) score += token.length >= 5 ? 3 : 1;
      }
      if (document.sourceKind === "sheet" && scope === "internal") score += 2;
      return { document, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
};

const snippetForQuery = (content: string, query: string) => {
  const clean = content.slice(0, MAX_DOCUMENT_CHARS);
  const tokens = normalizeArabic(query).split(" ").filter((token) => token.length >= 3);
  const normalized = normalizeArabic(clean);
  let index = tokens.reduce((found, token) => found >= 0 ? found : normalized.indexOf(token), -1);
  if (index < 0) index = 0;
  const start = Math.max(0, Math.floor(index * (clean.length / Math.max(1, normalized.length))) - 350);
  return clean.slice(start, start + 2_200).trim();
};

export async function lookupBHGKnowledgeSources(
  query: string,
  options: { scope?: KnowledgeScope } = {},
): Promise<OfficialSource[]> {
  const index = await getKnowledgeIndex();
  const documents = index?.documents || [];
  const scope = options.scope || "public";
  return rankDocuments(documents, query, scope).map(({ document }) => ({
    title: document.title,
    url: document.url,
    snippet: snippetForQuery(document.content, query),
    sourceKind: document.sourceKind,
    verifiedAt: index?.updatedAt,
  }));
}

export async function lookupOfficialBoudlSources(query: string): Promise<OfficialSource[]> {
  return lookupBHGKnowledgeSources(query, { scope: "public" });
}
