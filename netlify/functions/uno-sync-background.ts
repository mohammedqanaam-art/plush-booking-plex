import type { Context } from "@netlify/functions";
import { createHash, timingSafeEqual } from "node:crypto";

const secretValue = () => {
  const configured = Netlify.env.get("UNO_SYNC_SECRET")?.trim();
  if (configured) return configured;
  const password = Netlify.env.get("UNO_PASSWORD") || Netlify.env.get("UNO_LOGIN_PASSWORD") || "";
  return password ? createHash("sha256").update(`uno-sync:${password}`).digest("hex") : "";
};

const authorized = (req: Request, expected: string) => {
  const provided = req.headers.get("x-uno-sync-key") || "";
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
  if (!["dispatch-sync", "dispatch-keepalive"].includes(body.action || "")) return;

  const origin = context.site.url || new URL(req.url).origin;
  const fullSync = body.action === "dispatch-sync";
  const endpoint = new URL(fullSync ? "/api/admin/uno-report" : "/api/admin/uno", origin);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-UNO-Sync-Key": secret,
    },
    body: JSON.stringify({ action: fullSync ? "sync-system" : "keepalive-system" }),
    signal: AbortSignal.timeout(55_000),
  }).catch(() => null);

  if (!response?.ok) {
    console.warn("[uno-sync-background] UNO maintenance request did not complete", {
      action: body.action,
      status: response?.status || 0,
    });
  }
};
