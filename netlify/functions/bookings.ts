import { json, requireSameOrigin, validateSession } from "./_shared/security";
import { buildPublicBookingReport } from "./_shared/bookingReport";
import { BookingCsvError, inspectBookingReportText, saveBookingReportText } from "./_shared/bookingCsv";
import { publicCachedJson } from "./_shared/publicCache";
import { getEnvironmentStore } from "./_shared/storage";

export default async (req: Request) => {
  const method = req.method;
  const store = getEnvironmentStore("bookings", { consistency: "strong" });

  if (method === "GET") {
    try {
      const bookings = (await store.get("data", { type: "json" })) as Record<string, string>[] | null || [];
      const stats = (await store.get("stats", { type: "json" })) as Record<string, unknown> | null || {
        total: 0,
        confirmed: 0,
        cancelled: 0,
        cancelRate: 0,
      };

      const requestUrl = new URL(req.url);
      if (requestUrl.searchParams.get("view") === "summary") {
        const settingsStore = getEnvironmentStore("settings");
        const settings = ((await settingsStore.get("site", { type: "json" })) as Record<string, unknown> | null) || {};
        const report = buildPublicBookingReport(
          Array.isArray(bookings) ? bookings : [],
          settings,
          typeof stats.updatedAt === "string" ? stats.updatedAt : null,
          {
            dateFrom: typeof stats.dateFrom === "string" ? stats.dateFrom : null,
            dateTo: typeof stats.dateTo === "string" ? stats.dateTo : null,
          },
        );
        return publicCachedJson(report, requestUrl.searchParams.get("fresh") === "1");
      }

      const session = await validateSession(req);
      if (!session) return json({ error: "Unauthorized" }, 401);
      return json({ bookings: Array.isArray(bookings) ? bookings : [], stats });
    } catch (error) {
      console.error("[bookings] load failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
      return json({ error: "تعذر تحميل بيانات الحجوزات. تمت حماية البيانات الحالية ولم يتم حذفها." }, 500);
    }
  }

  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);

  if (method === "DELETE") {
    if (!["superadmin", "admin"].includes(session.role)) {
      return json({ error: "Permission Denied" }, 403);
    }

    await store.setJSON("data", []);
    await store.setJSON("stats", { total: 0, confirmed: 0, cancelled: 0, cancelRate: 0, updatedAt: new Date().toISOString() });
    return json({ ok: true });
  }

  if (method === "POST") {
    if (!["superadmin", "admin", "editor"].includes(session.role)) {
      return json({ error: "Permission Denied" }, 403);
    }

    let reportText: string;
    try {
      reportText = await req.text();
    } catch {
      return json({ error: "Failed to read request body" }, 400);
    }

    if (!reportText.trim()) return json({ error: "ملف الحجوزات فارغ." }, 400);
    if (new TextEncoder().encode(reportText).byteLength > 5 * 1024 * 1024) {
      return json({ error: "حجم ملف الحجوزات يتجاوز 5 MB." }, 413);
    }

    try {
      const fileName = req.headers.get("x-report-filename") || "report.csv";
      const preview = new URL(req.url).searchParams.get("preview") === "1";
      if (preview) {
        const { stats } = inspectBookingReportText(reportText, fileName);
        return json({ ok: true, preview: true, stats });
      }
      const stats = await saveBookingReportText(reportText, fileName);
      return json({ ok: true, preview: false, stats });
    } catch (error) {
      console.error("[bookings] save failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
      if (error instanceof BookingCsvError) return json({ error: error.message }, error.status);
      return json({ error: "تعذر حفظ تقرير الحجوزات دون المساس بالتقرير السابق." }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
};
