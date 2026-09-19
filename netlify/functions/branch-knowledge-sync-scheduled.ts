import type { Config } from "@netlify/functions";
import { refreshOfficialBoudlKnowledgeIndex } from "./_shared/boudl-knowledge";

export default async () => {
  try {
    await refreshOfficialBoudlKnowledgeIndex();
  } catch (error) {
    console.warn("[branch-knowledge-sync] official BHG index refresh failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
  }
  return new Response(null, { status: 204 });
};

export const config: Config = {
  // 04:15 Asia/Riyadh. Visitor requests keep serving the last verified index.
  schedule: "15 1 * * *",
};
