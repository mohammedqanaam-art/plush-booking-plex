export type ProtocolEntry = {
  id: string; title: string; category: string; keywords: string[];
  response: string; steps: string[]; caution: string; sourceTitle: string;
  sourceUrl: string; status: "draft" | "source";
};
export type KnowledgeSyncStatus = {
  state: "live" | "partial" | "snapshot";
  checkedAt: string; snapshotDate: string; message: string;
  tabs: Array<{ title: string; url: string; fetchedAt: string | null; available: boolean }>;
};
export const normalizeKnowledgeText = (text: string) => text.normalize("NFKC").toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا")
  .replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const matchesKnowledgeQuery = (text: string, query: string) => {
  const haystack = normalizeKnowledgeText(text);
  return normalizeKnowledgeText(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
};
