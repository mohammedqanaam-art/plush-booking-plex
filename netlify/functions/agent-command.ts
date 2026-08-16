import type { Config } from "@netlify/functions";
import { callN8nAgent, n8nAgentConfigured } from "./_shared/n8n";
import { json, requireSameOrigin, validateSession } from "./_shared/security";
import { dispatchWorkflow, type ExecutableWorkflowKey } from "./_shared/workflowDispatcher";

const ACTIONS = [
  "branch_lookup",
  "refresh_branch_knowledge",
  "create_development_request",
  "run_workflow",
] as const;

type AgentAction = (typeof ACTIONS)[number];

const MUTATING = new Set<AgentAction>([
  "refresh_branch_knowledge",
  "create_development_request",
  "run_workflow",
]);

const allowedWorkflowKeys = () => new Set(
  (Netlify.env.get("N8N_ALLOWED_WORKFLOWS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[a-z0-9_-]{2,80}$/i.test(value)),
);

const sanitizePayload = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input).slice(0, 24)) {
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(key)) continue;
    if (typeof raw === "string") output[key] = raw.slice(0, 4_000);
    else if (typeof raw === "number" && Number.isFinite(raw)) output[key] = raw;
    else if (typeof raw === "boolean" || raw === null) output[key] = raw;
  }
  return output;
};

const workflowForAction = (action: AgentAction, requested: string): ExecutableWorkflowKey => {
  if (action === "branch_lookup") return "employee-support";
  if (action === "refresh_branch_knowledge") return "branch-knowledge-refresh";
  if (action === "create_development_request") return "development-request";
  return requested as ExecutableWorkflowKey;
};

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (!["superadmin", "admin"].includes(session.role)) return json({ error: "Permission denied" }, 403);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 24 * 1024) return json({ error: "Request too large" }, 413);

  let body: {
    action?: string;
    workflowKey?: string;
    confirm?: boolean;
    payload?: Record<string, unknown>;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action = String(body.action || "") as AgentAction;
  if (!ACTIONS.includes(action)) return json({ error: "Unsupported action" }, 400);
  if (MUTATING.has(action) && body.confirm !== true) {
    return json({ error: "Explicit confirmation required", requiresConfirmation: true }, 409);
  }

  const requestedWorkflow = String(body.workflowKey || "").trim();
  const workflowKey = workflowForAction(action, requestedWorkflow);
  if (!allowedWorkflowKeys().has(workflowKey)) {
    return json({ error: "Workflow is not allow-listed" }, 403);
  }

  const requestId = crypto.randomUUID();
  const payload = sanitizePayload(body.payload);
  const reason = String(body.reason || payload.request || "").trim().slice(0, 1_000);

  let execution;
  try {
    execution = await dispatchWorkflow({
      workflowKey,
      reason,
      payload,
      actor: { username: session.username, role: session.role },
    });
  } catch (error) {
    console.error("[agent-command] workflow execution failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
      workflowKey,
      requestId,
    });
    return json({ error: "تعذر تنفيذ الـWorkflow المطلوب.", workflowKey, requestId }, 502);
  }

  let agentReply = "";
  let orchestrator: "n8n" | "server-dispatcher" = "server-dispatcher";
  if (n8nAgentConfigured()) {
    try {
      const result = await callN8nAgent({
        version: 2,
        type: "admin_command_result",
        requestId,
        sessionId: `admin_${session.username.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
        actor: {
          type: "admin",
          username: session.username,
          role: session.role,
        },
        action,
        workflowKey,
        confirmed: body.confirm === true,
        reason,
        payload,
        executionResult: execution,
        governance: {
          source: "res-dashbord.com",
          executionIsServerSide: true,
          requireHumanApprovalForDeployment: true,
          noCredentialDisclosure: true,
        },
      });
      agentReply = result.reply;
      orchestrator = "n8n";
    } catch (error) {
      console.error("[agent-command] n8n orchestration unavailable; server execution retained", {
        code: error instanceof Error ? error.message : "UNKNOWN",
        workflowKey,
        requestId,
      });
    }
  }

  return json({
    ok: true,
    action,
    workflowKey,
    reply: execution.reply,
    agentReply: agentReply || null,
    orchestrator,
    execution,
    requestId,
  });
};

export const config: Config = {
  path: "/api/admin/agent-command",
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
