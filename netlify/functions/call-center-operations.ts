import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { buildCallCenterForecast, type CallCenterForecastReport } from "../../src/lib/callCenterForecast";
import {
  normalizeAvayaRoutingIdentifier,
  resolveCallCenterForecastScope,
  type CallCenterForecastScopeRequest,
} from "../../src/lib/callCenterForecastScope";
import type { AvayaReportRange, StoredAvayaReport } from "./avaya-sync";
import { evaluateAdminNetwork } from "./_shared/corporateNetwork";
import { getCallCenterProjects } from "./_shared/employeeWorkspace";
import { json, validateSession } from "./_shared/security";

const env = (name: string) => (typeof Netlify === "undefined" ? "" : (Netlify.env.get(name) || "").trim());
const operationsRoles = new Set(["admin", "superadmin"]);

const avayaStore = (context: Context) => context.deploy.context === "production"
  ? getStore({ name: "avaya_reports", consistency: "strong" })
  : getDeployStore({ name: "avaya_reports", deployID: context.deploy.id });

const safeAvayaLaunchUrl = () => {
  const raw = env("AVAYA_AGENT_URL");
  const allowedHosts = env("AVAYA_ALLOWED_HOSTS").split(/[\s,;]+/).map((value) => value.toLocaleLowerCase("en")).filter(Boolean);
  if (!raw || !allowedHosts.length) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname.toLocaleLowerCase("en"))) return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
};

export const mayAccessCallCenterOperations = (role: string) => operationsRoles.has(role);

export const mayExposeAvayaLaunchUrl = (network: ReturnType<typeof evaluateAdminNetwork>) => (
  network.required
  && network.configured
  && network.detected
  && network.trusted
  && network.allowed
);

export const parseForecastScopeRequest = (url: URL): CallCenterForecastScopeRequest | null => {
  const projectId = (url.searchParams.get("projectId") || "").trim();
  const routingKind = (url.searchParams.get("routingKind") || "").trim();
  const rawIdentifier = url.searchParams.get("routingIdentifier") || "";
  const routingIdentifier = normalizeAvayaRoutingIdentifier(rawIdentifier);
  const hasRoutingInput = Boolean(routingKind || rawIdentifier.trim());
  if (!projectId && !hasRoutingInput) return { kind: "overall" };
  if (!projectId || !/^[a-f0-9-]{20,80}$/i.test(projectId)) return null;
  if (!hasRoutingInput) return { kind: "project", projectId };
  if ((routingKind !== "queue" && routingKind !== "skill") || !routingIdentifier) return null;
  return { kind: routingKind, projectId, identifier: routingIdentifier };
};

const loadForecastReports = async (context: Context): Promise<CallCenterForecastReport[]> => {
  const store = avayaStore(context);
  const catalog = await store.get("catalog", { type: "json" }) as AvayaReportRange[] | null;
  if (!Array.isArray(catalog) || !catalog.length) return [];
  const ranges = [...catalog]
    .sort((left, right) => right.syncedAt.localeCompare(left.syncedAt))
    .slice(0, 90);
  const reports: CallCenterForecastReport[] = [];
  for (let index = 0; index < ranges.length; index += 10) {
    const batch = await Promise.all(ranges.slice(index, index + 10).map(async (range) => {
      const report = await store.get(`reports/${range.reportId}`, { type: "json" }) as StoredAvayaReport | null;
      return report ? {
        reportId: report.reportId,
        from: range.from,
        to: range.to,
        syncedAt: report.syncedAt,
        employees: report.employees,
        ...(report.routingScope ? { routingScope: report.routingScope } : {}),
      } satisfies CallCenterForecastReport : null;
    }));
    reports.push(...batch.filter((report): report is CallCenterForecastReport => Boolean(report)));
  }
  return reports;
};

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (!mayAccessCallCenterOperations(session.role)) return json({ error: "Administrator access required" }, 403);
  try {
    const scopeRequest = parseForecastScopeRequest(new URL(req.url));
    if (!scopeRequest) return json({ error: "Invalid forecast scope" }, 400);
    const network = evaluateAdminNetwork(session.role, context.ip);
    if (!network.allowed) return json({ error: "Trusted corporate network required" }, 403);
    const configuredLaunchUrl = safeAvayaLaunchUrl();
    const launchUrl = mayExposeAvayaLaunchUrl(network) ? configuredLaunchUrl : null;
    const [reports, projects] = await Promise.all([loadForecastReports(context), getCallCenterProjects()]);
    const scoped = resolveCallCenterForecastScope(reports, projects, scopeRequest);
    if (scoped.metadata.status === "invalid") return json({ error: "Invalid forecast scope" }, 400);
    return json({
      avaya: {
        reportSyncConfigured: Boolean(env("AVAYA_SYNC_KEY")),
        agentLaunchConfigured: Boolean(configuredLaunchUrl),
        launchUrl,
        product: env("AVAYA_PRODUCT_LABEL") || "يتطلب تحديد منتج وإصدار Avaya",
        network,
        accessPolicy: "لا يُعاد رابط Avaya إلا لإدارة مصرح لها ومن عنوان خروج شبكة أو VPN مؤسسي موجود في القائمة الموثوقة؛ ووضع enforce يرفض واجهة التشغيل خارجها.",
        browserPolicy: {
          desktopVoice: "Chrome أو Edge فقط بعد اعتماد جدول توافق منتج Avaya الفعلي.",
          safari: "أدوات اللوحة تعمل، أما صوت وكيل Avaya عبر Safari فغير مضمون ويحتاج اعتمادًا مكتوبًا أو تطبيق Avaya الأصلي.",
          mobile: "استخدم تطبيق Avaya المعتمد أو endpoint منفصل للصوت؛ لا يُفترض أن Safari هاتف كامل الوظائف.",
        },
      },
      forecast: buildCallCenterForecast(scoped.reports),
      forecastScope: scoped.metadata,
    });
  } catch (error) {
    console.error("[call-center-operations] load failed", { code: error instanceof Error ? error.message : "UNKNOWN" });
    return json({ error: "تعذر تحميل تشغيل مركز الاتصال." }, 500);
  }
};

export const config: Config = {
  path: "/api/call-center/operations",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip"] },
};
