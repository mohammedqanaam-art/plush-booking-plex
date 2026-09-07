import type { ProtocolEntry, KnowledgeSyncStatus } from "./knowledgeTypes";
import type { Branch } from "@/data/branches";
import type { BranchRecord } from "@/data/knowledge";
import type { KnowledgeEntry } from "@/data/operations";

export type InternalKnowledge = {
  refresh?: () => void;
  protocols?: ProtocolEntry[];
  sync?: KnowledgeSyncStatus;
  branches: Branch[];
  branchRecords: BranchRecord[];
  knowledgeEntries: KnowledgeEntry[];
};

export const knowledgeQuickIntents = ["شكوى", "إلغاء", "دخول مبكر", "بكج العرسان", "الإفطار", "الغرف", "رقم الاستقبال"];

