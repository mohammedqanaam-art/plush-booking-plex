import { getLiveKnowledge } from "./_shared/liveKnowledge";
import { protocolEntries } from "./_shared/protocolBank";
import type { Config } from "@netlify/functions";
import { json, validateSession } from "./_shared/security";

export default async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!await validateSession(req)) return json({ error: "Unauthorized" }, 401);

  // Data is bundled server-side only and is never loaded before authentication.
  const [branches, knowledge, operations] = await Promise.all([
    import("../../src/data/branches"),
    import("../../src/data/knowledge"),
    import("../../src/data/operations"),
  ]);
  const live = await getLiveKnowledge(knowledge.branchRecords);
  return json({
    branches: branches.branches,
    branchRecords: live.branchRecords,
    protocols: protocolEntries,
    sync: live.sync,
    knowledgeEntries: operations.buildKnowledgeEntries(live.branchRecords),
  });
};

export const config: Config = { path: "/api/employee/knowledge" };

