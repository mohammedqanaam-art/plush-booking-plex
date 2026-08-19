import type { Config } from "@netlify/functions";
import { queueBranchKnowledgeRefresh } from "./_shared/knowledgeRefresh";

export default async (req: Request) => {
  try {
    await queueBranchKnowledgeRefresh(new URL(req.url).origin);
    console.info("[branch-knowledge-refresh] queued by scheduler");
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[branch-knowledge-refresh] scheduler failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return new Response(null, { status: 500 });
  }
};

export const config: Config = {
  schedule: "15 */6 * * *",
};
