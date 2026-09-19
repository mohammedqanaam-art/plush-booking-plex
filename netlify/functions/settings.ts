import { json, requireSameOrigin, validateSession } from "./_shared/security";
import { getEnvironmentStore } from "./_shared/storage";

type SiteSettings = {
  siteTitle: string;
  bannerText: string;
  reportMonth: string;
  reportYear: string;
  hiddenEmployees: string[];
  employeeDisplayNames: Record<string, string>;
  complaintEmail: string;
  complaintEmailWebhook: string;
  complaintWhatsappNumber: string;
  themePreset: string;
  employeeAdjustments: Record<string, {
    confirmedAdjustment?: number;
    cancelledAdjustment?: number;
    adjustmentReason?: string;
    notes?: string;
    updatedBy?: string;
    updatedAt?: string;
  }>;
};

const DEFAULT_SETTINGS: SiteSettings = {
  siteTitle: "إدارة الحجز المركزي",
  bannerText: "",
  reportMonth: "",
  reportYear: "",
  hiddenEmployees: [],
  employeeDisplayNames: {},
  complaintEmail: "",
  complaintEmailWebhook: "",
  complaintWhatsappNumber: "",
  themePreset: "",
  employeeAdjustments: {},
};

const cleanText = (value: unknown, maxLength: number) => String(value || "").trim().slice(0, maxLength);

const cleanNameMap = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .slice(0, 500)
    .map(([key, name]) => [cleanText(key, 160), cleanText(name, 160)])
    .filter(([key, name]) => key && name));
};

const cleanAdjustments = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as SiteSettings["employeeAdjustments"])
    .slice(0, 500)
    .map(([key, item]) => {
      const finite = (number: unknown) => {
        const parsed = Number(number || 0);
        return Number.isFinite(parsed) ? Math.max(-100_000, Math.min(100_000, Math.trunc(parsed))) : 0;
      };
      return [cleanText(key, 160), {
        confirmedAdjustment: finite(item?.confirmedAdjustment),
        cancelledAdjustment: finite(item?.cancelledAdjustment),
        adjustmentReason: cleanText(item?.adjustmentReason, 500),
        notes: cleanText(item?.notes, 1_000),
        updatedBy: cleanText(item?.updatedBy, 120),
        updatedAt: cleanText(item?.updatedAt, 40),
      }];
    })
    .filter(([key]) => Boolean(key)));
};

export default async (req: Request) => {
  const store = getEnvironmentStore("settings", { consistency: "strong" });

  if (req.method === "GET") {
    try {
      const current = ((await store.get("site", { type: "json" })) as Partial<SiteSettings> | null) || {};
      const settings = { ...DEFAULT_SETTINGS, ...current };
      const session = await validateSession(req);
      if (session) return json(settings);
      return json({
        siteTitle: settings.siteTitle,
        bannerText: settings.bannerText,
        reportMonth: settings.reportMonth,
        reportYear: settings.reportYear,
        themePreset: settings.themePreset,
      });
    } catch (error) {
      console.error("[settings] load failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
      return json({ ...DEFAULT_SETTINGS, degraded: true }, 200);
    }
  }

  if (req.method === "PUT") {
    const originError = requireSameOrigin(req);
    if (originError) return originError;

    const session = await validateSession(req);
    if (!session) return json({ error: "Unauthorized" }, 401);
    if (!["superadmin", "admin"].includes(session.role)) return json({ error: "Permission Denied" }, 403);

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 256 * 1024) return json({ error: "Settings payload too large" }, 413);

    const body = (await req.json().catch(() => ({}))) as Partial<SiteSettings>;
    let stored: Partial<SiteSettings> = {};
    try {
      stored = ((await store.get("site", { type: "json" })) as Partial<SiteSettings> | null) || {};
    } catch (error) {
      console.error("[settings] previous settings read failed before save", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
    }
    const current: SiteSettings = { ...DEFAULT_SETTINGS, ...stored };
    const requestedEmail = body.complaintEmail !== undefined ? cleanText(body.complaintEmail, 254) : current.complaintEmail;
    if (requestedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
      return json({ error: "Invalid complaint email" }, 400);
    }

    const updated: SiteSettings = {
      siteTitle: body.siteTitle !== undefined ? cleanText(body.siteTitle, 120) : current.siteTitle,
      bannerText: body.bannerText !== undefined ? cleanText(body.bannerText, 500) : current.bannerText,
      reportMonth: body.reportMonth !== undefined ? cleanText(body.reportMonth, 30) : current.reportMonth,
      reportYear: body.reportYear !== undefined ? cleanText(body.reportYear, 8) : current.reportYear,
      hiddenEmployees: Array.isArray(body.hiddenEmployees) ? body.hiddenEmployees.slice(0, 500).map((item) => cleanText(item, 160)).filter(Boolean) : current.hiddenEmployees,
      employeeDisplayNames: body.employeeDisplayNames !== undefined ? cleanNameMap(body.employeeDisplayNames) : current.employeeDisplayNames,
      complaintEmail: requestedEmail,
      complaintEmailWebhook: body.complaintEmailWebhook !== undefined ? cleanText(body.complaintEmailWebhook, 500) : current.complaintEmailWebhook,
      complaintWhatsappNumber: body.complaintWhatsappNumber !== undefined ? cleanText(body.complaintWhatsappNumber, 30).replace(/\D/g, "") : current.complaintWhatsappNumber,
      themePreset: body.themePreset !== undefined ? cleanText(body.themePreset, 80) : current.themePreset,
      employeeAdjustments: body.employeeAdjustments !== undefined ? cleanAdjustments(body.employeeAdjustments) : current.employeeAdjustments,
    };

    try {
      await store.setJSON("site", updated);
      const confirmed = ((await store.get("site", { type: "json" })) as Partial<SiteSettings> | null) || updated;
      return json({ ...DEFAULT_SETTINGS, ...confirmed });
    } catch (error) {
      console.error("[settings] save failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
      return json({ error: "تعذر حفظ الإعدادات. لم يتم حذف الإعدادات السابقة." }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
};
