import type { Config } from "@netlify/functions";
import { callN8nAgent } from "./_shared/n8n";
import { json, validateSession } from "./_shared/security";

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

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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

  const workflowKey = String(body.workflowKey || "").trim();
  if (action === "run_workflow") {
    if (!workflowKey || !allowedWorkflowKeys().has(workflowKey)) {
      return json({ error: "Workflow is not allow-listed" }, 403);
    }
  }

  const requestId = crypto.randomUUID();
  const payload = sanitizePayload(body.payload);
  const reason = String(body.reason || "").trim().slice(0, 1_000);

  try {
    const result = await callN8nAgent({
      version: 1,
      type: "admin_command",
      requestId,
      actor: {
        type: "admin",
        username: session.username,
        role: session.role,
      },
      action,
      workflowKey: workflowKey || undefined,
      confirmed: body.confirm === true,
      reason,
      payload,
      governance: {
        source: "res-dashbord.com",
        requireHumanApprovalForDeployment: true,
        noCredentialDisclosure: true,
      },
    });

    return json({
      ok: true,
      action,
      workflowKey: workflowKey || null,
      reply: result.reply || "تم تمرير الطلب إلى n8n.",
      result: typeof result.data === "object" ? result.data : { text: result.data },
      requestId,
    });
  } catch (error) {
    console.error("[agent-command] n8n command failed", {
      code: error instanceof Error ? error.message : "UNKNOWN",
      action,
      requestId,
    });
    return json({ error: "تعذر الوصول إلى n8n أو تنفيذ الأمر.", requestId }, 502);
  }
};

export const config: Config = {
  path: "/api/admin/agent-command",
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
