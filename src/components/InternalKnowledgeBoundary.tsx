import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import type { InternalKnowledge } from "@/lib/internalKnowledge";
import { KnowledgeContext } from "@/hooks/useInternalKnowledge";

export default function InternalKnowledgeBoundary({ children }: { children: ReactNode }) {
  const [data, setData] = useState<InternalKnowledge | null>(null);
  const [error, setError] = useState<"unauthorized" | "unavailable" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setData(null);
    setError(null);
    void fetch("/api/employee/knowledge", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 401 || response.status === 403) {
        if (active) setError("unauthorized");
        return;
      }
      if (!response.ok) throw new Error("Knowledge unavailable");
      const result = await response.json() as InternalKnowledge;
      if (!Array.isArray(result.branches) || !Array.isArray(result.branchRecords)
        || !Array.isArray(result.knowledgeEntries)) throw new Error("Invalid knowledge response");
      if (active) setData(result);
    }).catch(() => {
      if (active) setError("unavailable");
    });
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  if (error) return (
    <section className="page-surface m-4 space-y-3 text-center" role="alert">
      <ShieldCheck className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
      <p>{error === "unauthorized" ? "يلزم تسجيل الدخول لعرض المعلومات التشغيلية." : "تعذر تحميل المعلومات. لم تُعرض بيانات محفوظة أو قديمة."}</p>
      {error === "unauthorized"
        ? <Link className="text-primary underline" to="/admin/login">تسجيل الدخول الآمن</Link>
        : <button className="rounded-lg border px-4 py-2" onClick={() => setAttempt((value) => value + 1)}>إعادة المحاولة</button>}
    </section>
  );
  if (!data) return <p className="p-8 text-center text-sm text-muted-foreground" role="status">جارٍ تحميل المعلومات المحمية…</p>;
  // Memory is scoped to this mounted page, never persisted in browser storage.
  return <KnowledgeContext.Provider value={data}>{children}</KnowledgeContext.Provider>;
}
