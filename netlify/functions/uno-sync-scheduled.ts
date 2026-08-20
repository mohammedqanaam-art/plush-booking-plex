import type { Config, Context } from "@netlify/functions";
import { createHash } from "node:crypto";

export default async (req: Request, context: Context) => {
  const password = Netlify.env.get("UNO_PASSWORD") || Netlify.env.get("UNO_LOGIN_PASSWORD") || "";
  if (!password) return new Response(null, { status: 204 });
  const configuredSecret = Netlify.env.get("UNO_SYNC_SECRET")?.trim();
  const secret = configuredSecret || createHash("sha256").update(`uno-sync:${password}`).digest("hex");

  const origin = context.site.url || new URL(req.url).origin;
  const endpoint = new URL("/.netlify/functions/uno-sync-background", origin);
  const fullSync = new Date().getUTCMinutes() % 30 === 0;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UNO-Sync-Key": secret,
      },
      body: JSON.stringify({ action: fullSync ? "dispatch-sync" : "dispatch-keepalive" }),
      signal: AbortSignal.timeout(10_000),
    });

    // Netlify background functions acknowledge with 202 and continue outside
    // the 30-second scheduled-function limit.
    if (response.ok || response.status === 202) return new Response(null, { status: 204 });
    return new Response(null, { status: 502 });
  } catch {
    return new Response(null, { status: 502 });
  }
};

export const config: Config = {
  schedule: "*/10 * * * *",
};
