import { getEnvironmentStore } from "./storage";
import {
  getOfficialBoudlKnowledgeStatus,
  lookupBHGKnowledgeSources,
} from "./boudl-knowledge";
import { queueBranchKnowledgeRefresh } from "./knowledgeRefresh";

export type ExecutableWorkflowKey = "employee-support" | "branch-knowledge-refresh" | "development-request";

export type WorkflowExecution = {
  workflowKey: ExecutableWorkflowKey;
  status: "completed" | "queued";
  reply: string;
  data?: Record<string, unknown>;
};

type DispatchInput = {
  workflowKey: string;
  reason: string;
  payload: Record<string, unknown>;
  actor: { username: string; role: string };
};

type DevelopmentRequest = {
  id: string;
  createdAt: string;
  createdBy: string;
  role: string;
  request: string;
  payload: Record<string, unknown>;
  status: "new";
};

const DEVELOPMENT_QUEUE_LIMIT = 200;

const cleanRecord = (payload: Record<string, unknown>) => Object.fromEntries(
  Object.entries(payload)
    .slice(0, 24)
    .map(([key, value]) => {
      if (typeof value === "string") return [key, value.slice(0, 4_000)];
      if (typeof value === "number" && Number.isFinite(value)) return [key, value];
      if (typeof value === "boolean" || value === null) return [key, value];
      return [key, String(value ?? "").slice(0, 1_000)];
    }),
);

export async function queueDevelopmentRequest(input: Omit<DispatchInput, "workflowKey">): Promise<WorkflowExecution> {
  const store = getEnvironmentStore("development-requests", { consistency: "strong" });
  const current = ((await store.get("queue", { type: "json" })) as DevelopmentRequest[] | null) || [];
  const request: DevelopmentRequest = {
    id: `DEV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    createdBy: input.actor.username,
    role: input.actor.role,
    request: input.reason.trim().slice(0, 4_000),
    payload: cleanRecord(input.payload),
    status: "new",
  };
  await store.setJSON("queue", [request, ...current].slice(0, DEVELOPMENT_QUEUE_LIMIT));
  return {
    workflowKey: "development-request",
    status: "queued",
    reply: `تم تسجيل طلب التطوير ${request.id} في قائمة التنفيذ.`,
    data: { requestId: request.id, createdAt: request.createdAt },
  };
}

export async function dispatchWorkflow(input: DispatchInput): Promise<WorkflowExecution> {
  if (input.workflowKey === "employee-support") {
    const query = input.reason.trim() || String(input.payload.request || "معلومات الفروع").trim();
    const sources = await lookupBHGKnowledgeSources(query, { scope: "internal" });
    return {
      workflowKey: "employee-support",
      status: "completed",
      reply: sources.length
        ? `تم تشغيل مسار دعم الموظفين والعثور على ${sources.length} مصدر BHG معتمد مرتبط بالطلب.`
        : "تم تشغيل مسار دعم الموظفين، لكن لم يتم العثور على مصدر BHG معتمد مطابق حاليًا.",
      data: {
        sourceCount: sources.length,
        sources: sources.map((source) => ({ title: source.title, url: source.url })),
      },
    };
  }

  if (input.workflowKey === "branch-knowledge-refresh") {
    const current = await getOfficialBoudlKnowledgeStatus().catch(() => null);
    await queueBranchKnowledgeRefresh();
    return {
      workflowKey: "branch-knowledge-refresh",
      status: "queued",
      reply: "تم وضع تحديث معرفة BHG في الخلفية. يظل المساعد سريعاً ويستمر باستخدام آخر فهرس موثوق أثناء التحديث.",
      data: {
        queued: true,
        currentDocumentCount: current?.documentCount || 0,
        currentUpdatedAt: current?.updatedAt || null,
      },
    };
  }

  if (input.workflowKey === "development-request") {
    return queueDevelopmentRequest(input);
  }

  throw new Error("WORKFLOW_NOT_IMPLEMENTED");
}
