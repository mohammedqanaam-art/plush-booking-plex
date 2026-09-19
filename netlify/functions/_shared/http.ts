export function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.append("Vary", "Cookie");
  return new Response(JSON.stringify(data), { status, headers });
}

function trustedRequestOrigins(req: Request): Set<string> {
  const origins = new Set<string>([
    "https://res-dashbord.com",
    "https://www.res-dashbord.com",
  ]);
  const addOrigin = (value?: string | null) => {
    if (!value) return;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed proxy/environment values.
    }
  };

  addOrigin(req.url);

  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost && /^(https?|wss?)$/i.test(forwardedProto)) {
    addOrigin(`${forwardedProto.toLowerCase()}://${forwardedHost}`);
  }

  if (typeof Netlify !== "undefined") {
    addOrigin(Netlify.env.get("URL"));
    addOrigin(Netlify.env.get("DEPLOY_PRIME_URL"));
    addOrigin(Netlify.env.get("DEPLOY_URL"));
  }

  return origins;
}

export function isSameOriginRequest(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return trustedRequestOrigins(req).has(new URL(origin).origin);
    } catch {
      return false;
    }
  }

  const fetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (!fetchSite) return true;
  return fetchSite === "same-origin" || fetchSite === "none";
}

export function requireSameOrigin(req: Request): Response | null {
  return isSameOriginRequest(req) ? null : json({ error: "Cross-origin request rejected" }, 403);
}
