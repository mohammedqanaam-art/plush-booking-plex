import { createContext, useContext } from "react";
import type { InternalKnowledge } from "@/lib/internalKnowledge";

export const KnowledgeContext = createContext<InternalKnowledge | null>(null);

export function useInternalKnowledge() {
  const data = useContext(KnowledgeContext);
  if (!data) throw new Error("Internal knowledge requires an authenticated boundary");
  return data;
}
