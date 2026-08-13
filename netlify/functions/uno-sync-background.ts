import type { Context } from "@netlify/functions";
import { createHash, timingSafeEqual } from "node:crypto";

const secretValue = () => {
  const configured = Netlify.env.get("UNO_SYNC_SECRET")?.trim();
  if (configured) return configured;
  const password = Netlify.env.get("UNO_PASSWORD") || Netlify.env.get("UNO_LOGIN_PASSWORD") || "";
  return password ? createHash("sha256").update(`uno-sync:${password}`).digest("hex") : "";
};

const authorized = (req: Request, expected: string) => {
  const provided = req.headers.get("x-uno-sync-secret") || "";
  if (!expected || !provided) return false;
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(provided).digest(),
  );
};

export default async (req: Request, context: Context) => {
  const secret = secretValue();
  if (req.method !== "POST" || !authorized(req, secret)) return;

  const body = await req.json().catch(() => ({})) as { action?: string };
  if (body.action !== "dispatch-sync") return;

  const origin = context.site.url || new URL(req.url).origin;
  const endpoint = new URL("/api/admin/uno", origin);
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-UNO-Sync-Secret": secret,
    },
    body: JSON.stringify({ action: "sync-system" }),
    signal: AbortSignal.timeout(55_000),
  }).catch(() => undefined);
};
