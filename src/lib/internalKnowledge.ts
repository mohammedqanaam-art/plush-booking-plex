import type { Branch } from "@/data/branches";
import type { BranchRecord } from "@/data/knowledge";
import type { KnowledgeEntry } from "@/data/operations";

export type InternalKnowledge = {
  branches: Branch[];
  branchRecords: BranchRecord[];
  knowledgeEntries: KnowledgeEntry[];
};

export const knowledgeQuickIntents = ["رقم الاستقبال", "الإفطار", "المسبح", "الغرف"];
