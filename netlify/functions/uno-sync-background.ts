import { createHash, timingSafeEqual } from "node:crypto";
import { handleUnoReport } from "./uno-report";

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

export default async (req: Request) => {
  const secret = secretValue();
  if (req.method !== "POST" || !authorized(req, secret)) return;

  const body = await req.json().catch(() => ({})) as { action?: string };
  if (body.action !== "dispatch-sync") return;

  // Execute inside the Background Function's 15-minute window. Calling the public
  // synchronous function over HTTP would reintroduce the shorter request timeout.
  const internalRequest = new Request(new URL("/api/admin/uno-report", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-UNO-Sync-Key": secret,
    },
    body: JSON.stringify({ action: "sync-system" }),
  });

  try {
    const response = await handleUnoReport(internalRequest);
    if (!response.ok) {
      console.warn("[uno-sync-background] reconciled report sync did not complete", {
        status: response.status,
      });
    }
  } catch (error) {
    console.warn("[uno-sync-background] report execution failed", {
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
  }
};
