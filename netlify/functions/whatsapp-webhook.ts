import type { Config } from "@netlify/functions";
import { callConfiguredN8nWebhook } from "./_shared/n8n";
import { json } from "./_shared/security";

export default async (req: Request) => {
  if (!["GET", "POST"].includes(req.method)) {
    return new Response("Method not allowed", { status: 405 });
  }

  const incomingUrl = new URL(req.url);
  if (req.method === "GET" && incomingUrl.searchParams.get("health") === "1") {
    return json({
      ok: true,
      proxy: "whatsapp-to-n8n",
      configured: Boolean(Netlify.env.get("N8N_WHATSAPP_WEBHOOK_URL")?.trim()),
      agentAuthConfigured: Boolean(Netlify.env.get("N8N_AGENT_SHARED_SECRET")?.trim()),
    });
  }

  if (!Netlify.env.get("N8N_WHATSAPP_WEBHOOK_URL")?.trim()) {
    console.error("[whatsapp-webhook] N8N_WHATSAPP_WEBHOOK_URL is not configured");
    return new Response("Webhook is not configured", { status: 503 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 1024 * 1024) return new Response("Payload too large", { status: 413 });

  let body: ArrayBuffer | undefined;
  if (req.method === "POST") {
    body = await req.arrayBuffer();
    if (body.byteLength > 1024 * 1024) return new Response("Payload too large", { status: 413 });
  }

  try {
    return await callConfiguredN8nWebhook("N8N_WHATSAPP_WEBHOOK_URL", req, body);
  } catch (error) {
    console.error("[whatsapp-webhook] Failed to reach n8n", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return new Response("Failed to reach automation service", { status: 502 });
  }
};

export const config: Config = {
  path: "/api/whatsapp/webhook",
  rateLimit: {
    windowLimit: 180,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
