import { json, requireSameOrigin, validateSession } from "./_shared/security";
import { buildPublicBookingReport } from "./_shared/bookingReport";
import {
  BookingCsvError,
  inspectBookingReportText,
  isUnoBookingSourceFormat,
  saveBookingReportText,
} from "./_shared/bookingCsv";
import { publicCachedJson } from "./_shared/publicCache";
import { getEnvironmentStore } from "./_shared/storage";

export default async (req: Request) => {
  const method = req.method;
  const store = getEnvironmentStore("bookings", { consistency: "strong" });

  if (method === "GET") {
    try {
      const [unoBookings, unoStats, legacyBookings, legacyStats] = await Promise.all([
        store.get("uno-data", { type: "json" }).catch(() => null),
        store.get("uno-stats", { type: "json" }).catch(() => null),
        store.get("data", { type: "json" }).catch(() => null),
        store.get("stats", { type: "json" }).catch(() => null),
      ]) as [Record<string, string>[] | null, Record<string, unknown> | null, Record<string, string>[] | null, Record<string, unknown> | null];
      // Backward compatibility for the last successful UNO sync that predates the
      // dedicated keys. Generic CSV/CRO data is never accepted as report input.
      const legacyFileName = String(legacyStats?.sourceFileName || "");
      const legacyIsUno = isUnoBookingSourceFormat(legacyStats?.sourceFormat)
        || /^uno-(?:live|reconciled)-/i.test(legacyFileName);
      const bookings = Array.isArray(unoBookings)
        ? unoBookings
        : legacyIsUno && Array.isArray(legacyBookings)
          ? legacyBookings
          : [];
      const stats = unoStats || (legacyIsUno ? legacyStats : null) || {
        total: 0,
        confirmed: 0,
        cancelled: 0,
        cancelRate: 0,
        sourceFormat: "uno-live-api",
        sourceLabel: "UNO Voice API",
      };

      const requestUrl = new URL(req.url);
      if (requestUrl.searchParams.get("view") === "summary") {
        const settingsStore = getEnvironmentStore("settings");
        const settings = ((await settingsStore.get("site", { type: "json" })) as Record<string, unknown> | null) || {};
        const report = buildPublicBookingReport(
          bookings,
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
      if (!["superadmin", "admin", "editor"].includes(session.role)) {
        return json({ error: "Permission Denied" }, 403);
      }
      return json({ bookings, stats });
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

    const emptyStats = {
      total: 0,
      confirmed: 0,
      cancelled: 0,
      cancelRate: 0,
      updatedAt: new Date().toISOString(),
      sourceFormat: "uno-live-api",
      sourceLabel: "UNO Voice API",
    };
    await Promise.all([
      store.setJSON("data", []),
      store.setJSON("stats", emptyStats),
      store.setJSON("uno-data", []),
      store.setJSON("uno-stats", emptyStats),
    ]);
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
      const inspected = inspectBookingReportText(reportText, fileName);
      if (preview) {
        const { stats } = inspected;
        return json({ ok: true, preview: true, stats });
      }
      if (!isUnoBookingSourceFormat(inspected.stats.sourceFormat)) {
        return json({ error: "يُعتمد تقرير الحجوزات من UNO فقط. ملفات CSV أو CRO لا تستبدل الأرقام الحالية." }, 400);
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
