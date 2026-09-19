export const publicCachedJson = (data: unknown, fresh = false) => new Response(JSON.stringify(data), {
  status: 200,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": fresh ? "no-store" : "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control": fresh ? "no-store" : "public, durable, max-age=30, stale-while-revalidate=30",
    "X-Res-Cache": fresh ? "bypass" : "public-report",
  },
});
