import { getStore } from "@netlify/blobs";
import { croEnvironmentReady, croEnvironmentValue } from "./croEnvironment";

export type CroAutomaticMode = "rolling-month" | "fixed";
export type CroAutomationInterval = 30 | 60 | 120 | 360;

export type CroAutomationSettings = {
  enabled: boolean;
  intervalMinutes: CroAutomationInterval;
  mode: CroAutomaticMode;
  fixedFrom?: string;
  fixedTo?: string;
  updatedAt?: string;
  updatedBy?: string;
  lastTriggeredAt?: string;
};

export const currentSaudiMonthRange = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const year = Number(value("year"));
  const month = Number(value("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("تعذر تحديد الشهر الحالي بتوقيت الرياض.");
  }
  const paddedMonth = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${paddedMonth}-01`,
    to: `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`,
  };
};

export type CroSyncState = "idle" | "queued" | "running" | "success" | "error";
export type CroSyncSource = "manual" | "automatic" | "viewer";

export type CroSyncStatus = {
  state: CroSyncState;
  attemptId?: string;
  source?: CroSyncSource;
  from?: string;
  to?: string;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  stats?: {
    total: number;
    confirmed: number;
    cancelled: number;
    cancelRate: number;
    updatedAt: string;
  };
};

const store = () => getStore({ name: "cro-sync", consistency: "strong" });
const AUTOMATION_SETTINGS_KEY = "automation-settings";
const AUTOMATION_INTERVALS = new Set<CroAutomationInterval>([30, 60, 120, 360]);

export const getCroSyncStatus = async (): Promise<CroSyncStatus> => (
  (await store().get("latest", { type: "json" })) as CroSyncStatus | null
) || { state: "idle" };

export const setCroSyncStatus = async (status: CroSyncStatus) => {
  await store().setJSON("latest", status);
  return status;
};

export const isActiveCroSync = (status: CroSyncStatus, maxAgeMs = 20 * 60 * 1000) => {
  if (status.state !== "queued" && status.state !== "running") return false;
  const timestamp = Date.parse(status.startedAt || status.queuedAt || "");
  return Number.isFinite(timestamp) && Date.now() - timestamp < maxAgeMs;
};

export const validCroDateRange = (from?: string, to?: string) => Boolean(
  from
  && to
  && /^\d{4}-\d{2}-\d{2}$/.test(from)
  && /^\d{4}-\d{2}-\d{2}$/.test(to)
  && from <= to,
);

const environmentAutomaticConfig = () => {
  const requestedMode = croEnvironmentValue("CRO_AUTO_MODE");
  const mode: CroAutomaticMode = requestedMode === "fixed" ? "fixed" : "rolling-month";
  const rolling = currentSaudiMonthRange();
  const from = mode === "fixed" ? croEnvironmentValue("CRO_AUTO_FROM") || rolling.from : rolling.from;
  const to = mode === "fixed" ? croEnvironmentValue("CRO_AUTO_TO") || rolling.to : rolling.to;
  return {
    configured: Boolean(
      croEnvironmentValue("CRO_USERNAME")
      && croEnvironmentValue("CRO_PASSWORD")
      && croEnvironmentValue("CRO_SYNC_SECRET"),
    ),
    environmentReady: croEnvironmentReady(),
    mode,
    from,
    to,
    schedule: "*/30 * * * *",
  };
};

const defaultAutomationSettings = (): CroAutomationSettings => {
  const environment = environmentAutomaticConfig();
  return {
    enabled: true,
    intervalMinutes: 30,
    mode: environment.mode,
    fixedFrom: environment.mode === "fixed" ? environment.from : undefined,
    fixedTo: environment.mode === "fixed" ? environment.to : undefined,
  };
};

const normalizeAutomationSettings = (
  input: Partial<CroAutomationSettings> | null,
): CroAutomationSettings => {
  const defaults = defaultAutomationSettings();
  const interval = Number(input?.intervalMinutes) as CroAutomationInterval;
  const mode: CroAutomaticMode = input?.mode === "fixed" ? "fixed" : "rolling-month";
  return {
    ...defaults,
    ...input,
    enabled: input?.enabled !== false,
    intervalMinutes: AUTOMATION_INTERVALS.has(interval) ? interval : defaults.intervalMinutes,
    mode,
    fixedFrom: mode === "fixed" && validCroDateRange(input?.fixedFrom, input?.fixedTo)
      ? input?.fixedFrom
      : defaults.fixedFrom,
    fixedTo: mode === "fixed" && validCroDateRange(input?.fixedFrom, input?.fixedTo)
      ? input?.fixedTo
      : defaults.fixedTo,
  };
};

export const getCroAutomationSettings = async () => {
  const saved = (await store().get(AUTOMATION_SETTINGS_KEY, { type: "json" })) as Partial<CroAutomationSettings> | null;
  return normalizeAutomationSettings(saved);
};

export const updateCroAutomationSettings = async (
  patch: Partial<CroAutomationSettings>,
  updatedBy?: string,
) => {
  const current = await getCroAutomationSettings();
  const next = normalizeAutomationSettings({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || current.updatedBy,
  });
  await store().setJSON(AUTOMATION_SETTINGS_KEY, next);
  return next;
};

export const markCroAutomationTriggered = async (triggeredAt = new Date().toISOString()) => {
  const current = await getCroAutomationSettings();
  const next = { ...current, lastTriggeredAt: triggeredAt };
  await store().setJSON(AUTOMATION_SETTINGS_KEY, next);
  return next;
};

export const isCroAutomationDue = (
  settings: Pick<CroAutomationSettings, "enabled" | "intervalMinutes" | "lastTriggeredAt">,
  now = Date.now(),
) => {
  if (!settings.enabled) return false;
  const lastTriggeredAt = Date.parse(settings.lastTriggeredAt || "");
  if (!Number.isFinite(lastTriggeredAt)) return true;
  return now - lastTriggeredAt >= settings.intervalMinutes * 60 * 1000 - 30_000;
};

export const automaticCroConfig = async () => {
  const environment = environmentAutomaticConfig();
  const settings = await getCroAutomationSettings();
  const rolling = currentSaudiMonthRange();
  const mode = settings.mode;
  const from = mode === "fixed" && validCroDateRange(settings.fixedFrom, settings.fixedTo)
    ? settings.fixedFrom as string
    : rolling.from;
  const to = mode === "fixed" && validCroDateRange(settings.fixedFrom, settings.fixedTo)
    ? settings.fixedTo as string
    : rolling.to;
  const lastTriggeredAt = settings.lastTriggeredAt || null;
  const nextRunAt = settings.enabled && lastTriggeredAt
    ? new Date(Date.parse(lastTriggeredAt) + settings.intervalMinutes * 60 * 1000).toISOString()
    : null;
  return {
    ...environment,
    enabled: settings.enabled,
    intervalMinutes: settings.intervalMinutes,
    mode,
    from,
    to,
    fixedFrom: settings.fixedFrom,
    fixedTo: settings.fixedTo,
    updatedAt: settings.updatedAt || null,
    updatedBy: settings.updatedBy || null,
    lastTriggeredAt,
    nextRunAt,
  };
};
