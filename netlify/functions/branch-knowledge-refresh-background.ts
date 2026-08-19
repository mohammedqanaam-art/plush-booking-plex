import type { Config } from "@netlify/functions";
import { createHash, timingSafeEqual } from "node:crypto";
import { refreshOfficialBoudlKnowledgeIndex } from "./_shared/boudl-knowledge";
import { json } from "./_shared/security";

const digest = (value: string) => createHash("sha256").update(value).digest();

const authorized = (req: Request) => {
  const expected = Netlify.env.get("BHG_KNOWLEDGE_REFRESH_SECRET")?.trim() || "";
  const provided = req.headers.get("X-BHG-Knowledge-Key")?.trim() || "";
  if (!expected || !provided) return false;
  return timingSafeEqual(digest(expected), digest(provided));
};

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  try {
    const index = await refreshOfficialBoudlKnowledgeIndex();
    console.info("[branch-knowledge-refresh] completed", {
      documentCount: index.documentCount || 0,
      hotelCount: index.hotelCount,
      sourceCounts: index.sourceCounts,
      updatedAt: index.updatedAt,
    });
    return json({
      ok: true,
      documentCount: index.documentCount || 0,
      hotelCount: index.hotelCount,
      sourceCounts: index.sourceCounts,
      updatedAt: index.updatedAt,
    });
  } catch (error) {
    console.error("[branch-knowledge-refresh] failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return json({ error: "Knowledge refresh failed" }, 502);
  }
};

export const config: Config = {
  rateLimit: {
    windowLimit: 6,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
