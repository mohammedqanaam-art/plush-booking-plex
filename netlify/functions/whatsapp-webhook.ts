import type { Config } from "@netlify/functions";

export default async (req: Request) => {
  if (!["GET", "POST"].includes(req.method)) {
    return new Response("Method not allowed", { status: 405 });
  }

  const upstreamBase = Netlify.env.get("N8N_WHATSAPP_WEBHOOK_URL")?.trim();
  if (!upstreamBase) {
    console.error("[whatsapp-webhook] N8N_WHATSAPP_WEBHOOK_URL is not configured");
    return new Response("Webhook is not configured", { status: 503 });
  }

  const incomingUrl = new URL(req.url);
  const upstreamUrl = new URL(upstreamBase);
  upstreamUrl.search = incomingUrl.search;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  const signature = req.headers.get("x-hub-signature-256");
  const userAgent = req.headers.get("user-agent");

  if (contentType) headers.set("content-type", contentType);
  if (signature) headers.set("x-hub-signature-256", signature);
  if (userAgent) headers.set("user-agent", userAgent);
  headers.set("accept", req.headers.get("accept") || "*/*");
  headers.set("x-bhg-webhook-proxy", "netlify");

  const body = req.method === "POST" ? await req.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(25_000),
    });

    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
    responseHeaders.set("cache-control", "no-store");

    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[whatsapp-webhook] Failed to reach n8n", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return new Response("Failed to reach automation service", { status: 502 });
  }
};

export const config: Config = {
  path: "/api/whatsapp/webhook",
};
