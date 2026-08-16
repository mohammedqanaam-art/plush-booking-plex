export type AgentCommandAction =
  | "branch_lookup"
  | "refresh_branch_knowledge"
  | "create_development_request"
  | "run_workflow";

export type AgentCommandResult = {
  ok: boolean;
  action: AgentCommandAction;
  workflowKey?: string | null;
  reply: string;
  requestId: string;
};

export async function runAgentCommand(options: {
  action: AgentCommandAction;
  reason: string;
  workflowKey?: string;
  payload?: Record<string, string | number | boolean | null>;
  confirm?: boolean;
}): Promise<AgentCommandResult> {
  const response = await fetch("/api/admin/agent-command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: options.action,
      reason: options.reason.slice(0, 1000),
      workflowKey: options.workflowKey,
      payload: options.payload || {},
      confirm: options.confirm === true,
    }),
  });
  const data = await response.json().catch(() => ({})) as Partial<AgentCommandResult> & { error?: string };
  if (!response.ok) throw new Error(data.error || "تعذر إرسال الأمر إلى n8n");
  return {
    ok: data.ok === true,
    action: data.action || options.action,
    workflowKey: data.workflowKey ?? options.workflowKey ?? null,
    reply: String(data.reply || "تم تمرير الأمر إلى n8n."),
    requestId: String(data.requestId || ""),
  };
}
