import { describe, expect, it } from "vitest";
import { publicCachedJson } from "../../netlify/functions/_shared/publicCache";

describe("public report cache policy", () => {
  it("caches the public aggregate briefly at Netlify while browsers revalidate", () => {
    const response = publicCachedJson({ ok: true });

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("Netlify-CDN-Cache-Control")).toBe("public, durable, max-age=30, stale-while-revalidate=30");
    expect(response.headers.get("X-Res-Cache")).toBe("public-report");
  });

  it("bypasses every cache when a live refresh is requested", () => {
    const response = publicCachedJson({ ok: true }, true);

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Netlify-CDN-Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Res-Cache")).toBe("bypass");
  });
});
