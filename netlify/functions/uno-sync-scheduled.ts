import type { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const secret = Netlify.env.get("UNO_SYNC_SECRET")?.trim();
  if (!secret) return new Response(null, { status: 204 });

  const origin = context.site.url || new URL(req.url).origin;
  const endpoint = new URL("/api/admin/uno", origin);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UNO-Sync-Secret": secret,
      },
      body: JSON.stringify({ action: "sync-system" }),
      signal: AbortSignal.timeout(28_000),
    });

    // A 409 means UNO requires a fresh admin/OTP session. Keep the last good
    // snapshot and wait for the next authenticated reconnect instead of failing
    // the published schedule or repeatedly requesting OTP codes.
    if (response.ok || response.status === 409) return new Response(null, { status: 204 });
    return new Response(null, { status: 502 });
  } catch {
    return new Response(null, { status: 502 });
  }
};

export const config: Config = {
  schedule: "*/30 * * * *",
};
