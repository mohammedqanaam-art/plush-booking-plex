import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { saveBookingRecords, type BookingRecord, type BookingSaveResult } from "./_shared/bookingCsv";
import { getSessionToken, json, validateSession } from "./_shared/security";

const DEFAULT_UNO_RESERVATIONS_URL = "https://unolive-voice.rategain.com/view-reservations?brandId=3868248c-c053-43f2-b9c8-3188c74dfeb5&chainId=cdcc2737-a6b9-45bc-9d91-b1a760fb8026";
const DEFAULT_UNO_API_BASE_URL = "https://uno-prod-ui-api-1087875874170.us-central1.run.app/api/";
const DEFAULT_UNO_VOICE_API_BASE_URL = "https://ibe-prod-api-cpayzgdkqq-uc.a.run.app/api/";
const DEFAULT_UNO_APP_VERSION = "29.2";
const AUTH_PATH = "AuthenticateUser/ValidateUserDetails";
const VOICE_SEARCH_PATH = "voice/allreservaions";
const LEGACY_SEARCH_PATHS = ["reservation/SearchReservations", "reservation/allreservaions"] as const;
const UNO_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_DELAY_MS = 40 * 1000;
const SEARCH_LIMIT = 200;
const UNO_SNAPSHOT_LIMIT = 5_000;
const UNO_REPORT_LIMIT = 50_000;
const UNO_REPORT_MAX_DAY_SPAN = 30;
const UNO_REFRESH_WINDOW_MS = 45 * 60 * 1000;
const SYSTEM_STATE_KEY = "system";
const SYNC_HEALTH_KEY = "sync-health";
const AUTOMATIC_SYNC_FRESH_MS = 75 * 60 * 1000;

type JsonRecord = Record<string, unknown>;
type UnoPhase = "idle" | "otp" | "connected";
type UnoSearchField = "phone" | "pms" | "uno";
type UnoReportDateType = "booking" | "checkin" | "checkout";
type UnoReportStatus = "all" | "confirmed" | "cancelled" | "modified";

export type UnoReportFilters = {
  dateType: UnoReportDateType;
  from: string;
  to: string;
  property: string;
  status: UnoReportStatus;
};

type EncryptedValue = {
  iv: string;
  tag: string;
  data: string;
};

type PendingState = {
  phase: "otp";
  pendingAt: number;
  expiresAt: number;
  resendAt: number;
  ipAddress: string;
  attempts: number;
  reportFilters?: UnoReportFilters;
};

type ConnectedState = {
  phase: "connected";
  connectedAt: number;
  expiresAt: number;
  encrypted: EncryptedValue;
  reportFilters?: UnoReportFilters;
};

type StoredState = PendingState | ConnectedState;

type UnoSession = {
  token: string;
  userId: string;
  sessionId: string;
  ipAddress: string;
  chainId: string;
  accountName: string;
  properties: Array<{ id: string; name: string }>;
};

export type NormalizedReservation = {
  unoNumber: string;
  pmsNumber: string;
  phone: string;
  guestName: string;
  agentName: string;
  property: string;
  city: string;
  status: string;
  checkIn: string;
  checkOut: string;
  bookingDate: string;
  channel: string;
  amount: string;
  currency: string;
};

type UnoSnapshot = {
  reservations: NormalizedReservation[];
  total: number;
  syncedAt: string;
  source: "automatic" | "manual";
  sessionExpiresAt: string | null;
  reportFilters?: UnoReportFilters;
  productivity?: {
    published: boolean;
    updatedAt?: string;
    records?: number;
    employees?: number;
    error?: string;
  };
};

type UnoSyncHealth = {
  state: "never" | "running" | "healthy" | "verification_required" | "failed";
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastSuccessSource?: "automatic" | "manual";
  lastError?: string;
  lastCount?: number;
  consecutiveFailures: number;
  requiresOtp: boolean;
  reportFilters?: UnoReportFilters;
};

const rawEnv = (key: string) => Netlify.env.get(key) || "";
const trimmedEnv = (key: string) => rawEnv(key).trim();

const asRecord = (value: unknown): JsonRecord => {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
};

const asString = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
};

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const riyadhToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const currentMonthUnoSyncFilters = (): UnoReportFilters => {
  const today = riyadhToday();
  return {
    dateType: "booking",
    from: `${today.slice(0, 7)}-01`,
    to: today,
    property: "all",
    status: "all",
  };
};

const defaultReportFilters = currentMonthUnoSyncFilters;

export const isCanonicalUnoSyncFilters = (filters: UnoReportFilters) => {
  const canonical = currentMonthUnoSyncFilters();
  return filters.dateType === canonical.dateType
    && filters.from === canonical.from
    && filters.to === canonical.to
    && filters.property === canonical.property
    && filters.status === canonical.status;
};

const validIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`));

export const parseUnoReportFilters = (value: unknown): UnoReportFilters => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultReportFilters();
  const input = value as JsonRecord;
  const defaults = defaultReportFilters();
  const dateType = asString(input.dateType) || defaults.dateType;
  const from = asString(input.from) || defaults.from;
  const to = asString(input.to) || defaults.to;
  const property = asString(input.property) || "all";
  const status = asString(input.status) || "all";
  if (!["booking", "checkin", "checkout"].includes(dateType)) throw new Error("اختر نوع تاريخ صحيحًا.");
  if (!["all", "confirmed", "cancelled", "modified"].includes(status)) throw new Error("اختر حالة حجز صحيحة.");
  if (!validIsoDate(from) || !validIsoDate(to) || from > to) throw new Error("اختر فترة صحيحة للتقرير.");
  const span = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  if (span > UNO_REPORT_MAX_DAY_SPAN) throw new Error("UNO يسمح بفترة لا تتجاوز 30 يومًا بين تاريخ البداية والنهاية.");
  if (property.length > 160) throw new Error("اسم الفرع غير صالح.");
  return {
    dateType: dateType as UnoReportDateType,
    from,
    to,
    property,
    status: status as UnoReportStatus,
  };
};

const isExplicitFalse = (value: unknown) => (
  value === false
  || value === 0
  || (typeof value === "string" && ["false", "0"].includes(value.trim().toLowerCase()))
);

const isTruthy = (value: unknown) => (
  value === true
  || value === 1
  || (typeof value === "string" && ["true", "1"].includes(value.trim().toLowerCase()))
);

const firstValue = (record: JsonRecord, keys: string[]) => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return "";
};

const firstArray = (record: JsonRecord, keys: string[]): unknown[] => {
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
};

const deepFirstValue = (value: unknown, keys: string[], depth = 0): string => {
  if (depth > 5) return "";
  const record = asRecord(value);
  const direct = firstValue(record, keys);
  if (direct) return direct;
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = deepFirstValue(item, keys, depth + 1);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = deepFirstValue(child, keys, depth + 1);
      if (found) return found;
    }
  }
  return "";
};

export const isTrustedRateGainUrl = (value: string) => {
  try {
    const url = new URL(value);
    const rateGainHost = url.hostname === "rategain.com" || url.hostname.endsWith(".rategain.com");
    const approvedUnoApiHost = url.hostname === "uno-prod-ui-api-1087875874170.us-central1.run.app"
      || url.hostname === "uno-prod-ui-api-cpayzgdkqq-uc.a.run.app"
      || url.hostname === "ibe-prod-api-cpayzgdkqq-uc.a.run.app"
      || /^v\d+-\d+---uno-prod-ui-api-cpayzgdkqq-uc\.a\.run\.app$/.test(url.hostname);
    return url.protocol === "https:" && (rateGainHost || approvedUnoApiHost);
  } catch {
    return false;
  }
};

const readConfiguration = () => {
  const configuredReservationsUrl = trimmedEnv("UNO_RESERVATIONS_URL")
    || trimmedEnv("UNO_LOGIN_URL");
  const configuredApiBaseUrl = trimmedEnv("UNO_API_BASE_URL");
  const configuredVoiceApiBaseUrl = trimmedEnv("UNO_VOICE_API_BASE_URL");
  const loginUrl = isTrustedRateGainUrl(configuredReservationsUrl)
    ? configuredReservationsUrl
    : DEFAULT_UNO_RESERVATIONS_URL;
  const apiBaseUrl = isTrustedRateGainUrl(configuredApiBaseUrl)
    ? configuredApiBaseUrl
    : DEFAULT_UNO_API_BASE_URL;
  const voiceApiBaseUrl = isTrustedRateGainUrl(configuredVoiceApiBaseUrl)
    ? configuredVoiceApiBaseUrl
    : DEFAULT_UNO_VOICE_API_BASE_URL;
  const username = trimmedEnv("UNO_USERNAME") || trimmedEnv("UNO_LOGIN_EMAIL");
  const password = rawEnv("UNO_PASSWORD") || rawEnv("UNO_LOGIN_PASSWORD");
  const companyId = Math.max(1, Math.trunc(asNumber(trimmedEnv("UNO_COMPANY_ID")) || 1));
  const appVersion = trimmedEnv("UNO_APP_VERSION") || DEFAULT_UNO_APP_VERSION;

  return {
    loginUrl,
    apiBaseUrl: apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`,
    voiceApiBaseUrl: voiceApiBaseUrl.endsWith("/") ? voiceApiBaseUrl : `${voiceApiBaseUrl}/`,
    username,
    password,
    companyId,
    appVersion,
    configured: Boolean(username && password),
  };
};

const stateKey = (req: Request) => {
  const token = getSessionToken(req);
  if (!token) return null;
  return `admin_${createHash("sha256").update(token).digest("hex")}`;
};

const encryptionKey = (password: string) => (
  createHash("sha256").update(`uno-session:${password}`).digest()
);

const encryptSession = (session: UnoSession, password: string): EncryptedValue => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(password), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
};

const decryptSession = (value: EncryptedValue, password: string): UnoSession | null => {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(password),
      Buffer.from(value.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(value.data, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8")) as UnoSession;
  } catch {
    return null;
  }
};

const sessionStore = () => (
  Netlify.context?.deploy.context === "production"
    ? getStore({ name: "uno-sessions", consistency: "strong" })
    : getDeployStore("uno-sessions")
);

const snapshotStore = () => (
  Netlify.context?.deploy.context === "production"
    ? getStore({ name: "uno-reservations", consistency: "strong" })
    : getDeployStore("uno-reservations")
);

const readLatestSnapshot = async (): Promise<UnoSnapshot | null> => {
  try {
    const value = await snapshotStore().get("latest", { type: "json" }) as UnoSnapshot | null;
    return value?.syncedAt && Array.isArray(value.reservations) ? value : null;
  } catch {
    return null;
  }
};

const readSyncHealth = async (): Promise<UnoSyncHealth> => {
  try {
    const value = await snapshotStore().get(SYNC_HEALTH_KEY, { type: "json" }) as UnoSyncHealth | null;
    if (value?.state) return value;
  } catch {
    // Missing health data is represented as a never-run synchronization.
  }
  return {
    state: "never",
    consecutiveFailures: 0,
    requiresOtp: false,
  };
};

const writeSyncHealth = async (health: UnoSyncHealth) => {
  await snapshotStore().setJSON(SYNC_HEALTH_KEY, health);
  return health;
};

const markSyncAttempt = async () => {
  const previous = await readSyncHealth();
  return writeSyncHealth({
    ...previous,
    state: "running",
    lastAttemptAt: new Date().toISOString(),
    lastError: undefined,
    requiresOtp: false,
  });
};

const markSyncSuccess = async (
  source: "automatic" | "manual",
  total: number,
  reportFilters: UnoReportFilters,
) => {
  const now = new Date().toISOString();
  return writeSyncHealth({
    state: "healthy",
    lastAttemptAt: now,
    lastSuccessAt: now,
    lastSuccessSource: source,
    lastCount: total,
    consecutiveFailures: 0,
    requiresOtp: false,
    reportFilters,
  });
};

const markSyncFailure = async (
  error: string,
  requiresOtp = false,
) => {
  const previous = await readSyncHealth();
  return writeSyncHealth({
    ...previous,
    state: requiresOtp ? "verification_required" : "failed",
    lastAttemptAt: new Date().toISOString(),
    lastError: error,
    consecutiveFailures: (previous.consecutiveFailures || 0) + 1,
    requiresOtp,
  });
};

const getState = async (key: string) => {
  const store = sessionStore();
  try {
    return await store.get(key, { type: "json" }) as StoredState | null;
  } catch {
    return null;
  }
};

const setState = async (key: string, state: StoredState) => {
  const store = sessionStore();
  await store.setJSON(key, state);
};

const clearState = async (key: string) => {
  const store = sessionStore();
  await store.delete(key).catch(() => undefined);
};

const isInternalSyncRequest = (
  req: Request,
  configuration: ReturnType<typeof readConfiguration>,
) => {
  const expected = rawEnv("UNO_SYNC_SECRET") || (configuration.password
    ? createHash("sha256").update(`uno-sync:${configuration.password}`).digest("hex")
    : "");
  const provided = req.headers.get("x-uno-sync-key") || "";
  if (!expected || !provided) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
};

const publicStatus = (
  configuration: ReturnType<typeof readConfiguration>,
  phase: UnoPhase,
  state?: StoredState | null,
  session?: UnoSession | null,
) => ({
  configured: configuration.configured,
  loginUrl: configuration.loginUrl,
  phase,
  connected: phase === "connected",
  pendingUntil: state?.phase === "otp" ? new Date(state.expiresAt).toISOString() : undefined,
  resendAt: state?.phase === "otp" ? new Date(state.resendAt).toISOString() : undefined,
  expiresAt: state?.phase === "connected" ? new Date(state.expiresAt).toISOString() : undefined,
  accountName: session?.accountName || undefined,
  propertyCount: session?.properties.length || undefined,
  verifiedAt: state?.phase === "connected" ? new Date(state.connectedAt).toISOString() : undefined,
  reportFilters: state?.reportFilters || undefined,
  automaticSyncConfigured: configuration.configured && Netlify.context?.deploy.context === "production",
  automaticSyncEnabled: configuration.configured
    && Netlify.context?.deploy.context === "production"
    && phase === "connected",
});

const statusWithSnapshot = async (
  configuration: ReturnType<typeof readConfiguration>,
  phase: UnoPhase,
  state?: StoredState | null,
  session?: UnoSession | null,
) => {
  const [snapshot, health, system] = await Promise.all([
    readLatestSnapshot(),
    readSyncHealth(),
    readActiveState(SYSTEM_STATE_KEY, configuration),
  ]);
  const exportedAtMs = snapshot?.syncedAt ? new Date(snapshot.syncedAt).getTime() : 0;
  const connectedAt = state?.phase === "connected" ? state.connectedAt : 0;
  const automaticSyncConfigured = configuration.configured
    && Netlify.context?.deploy.context === "production";
  const automaticSyncEnabled = automaticSyncConfigured && system.phase === "connected";
  const lastSuccessAt = health.lastSuccessAt
    || (snapshot?.source === "automatic" ? snapshot.syncedAt : undefined);
  const lastSuccessMs = lastSuccessAt ? new Date(lastSuccessAt).getTime() : 0;
  const automaticSyncHealthy = automaticSyncEnabled
    && health.state === "healthy"
    && lastSuccessMs > 0
    && Date.now() - lastSuccessMs <= AUTOMATIC_SYNC_FRESH_MS;
  const automaticSyncState = !automaticSyncConfigured
    ? "disabled"
    : health.state === "running"
      ? "running"
      : health.requiresOtp || system.phase !== "connected"
        ? "verification_required"
        : automaticSyncHealthy
          ? "healthy"
          : "failed";
  return {
    ...publicStatus(configuration, phase, state, session),
    automaticSyncConfigured,
    automaticSyncEnabled,
    automaticSyncHealthy,
    automaticSyncState,
    lastSyncAttemptAt: health.lastAttemptAt,
    lastSyncSuccessAt: lastSuccessAt,
    lastSyncSuccessSource: health.lastSuccessSource,
    syncConsecutiveFailures: health.consecutiveFailures || 0,
    syncRequiresOtp: health.requiresOtp || system.phase !== "connected",
    syncError: health.lastError,
    syncReportFilters: health.reportFilters || currentMonthUnoSyncFilters(),
    lastExportAt: snapshot?.syncedAt || undefined,
    lastExportCount: snapshot?.total ?? undefined,
    lastExportSource: snapshot?.source || undefined,
    reportReady: phase === "connected" && connectedAt > 0 && exportedAtMs >= connectedAt,
    productivityReady: phase === "connected"
      && connectedAt > 0
      && exportedAtMs >= connectedAt
      && snapshot?.productivity?.published === true,
    productivityUpdatedAt: snapshot?.productivity?.updatedAt || undefined,
    productivityRecords: snapshot?.productivity?.records ?? undefined,
    productivityEmployees: snapshot?.productivity?.employees ?? undefined,
    reportError: phase === "connected" && exportedAtMs >= connectedAt
      ? snapshot?.productivity?.error || undefined
      : undefined,
  };
};

const readActiveState = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
) => {
  const state = await getState(key);
  if (!state) return { state: null, phase: "idle" as const, session: null };
  if (state.phase === "otp") {
    if (state.expiresAt <= Date.now()) {
      await clearState(key);
      return { state: null, phase: "idle" as const, session: null };
    }
    return { state, phase: "otp" as const, session: null };
  }

  const session = decryptSession(state.encrypted, configuration.password);
  if (!session?.token || !session.userId || !session.sessionId) {
    await clearState(key);
    return { state: null, phase: "idle" as const, session: null };
  }

  if (state.expiresAt <= Date.now() + UNO_REFRESH_WINDOW_MS) {
    const refreshed = await refreshConnectedState(key, configuration, state, session);
    if (refreshed) {
      return {
        state: refreshed.state,
        phase: "connected" as const,
        session: refreshed.session,
      };
    }
  }

  if (state.expiresAt <= Date.now()) {
    await clearState(key);
    return { state: null, phase: "idle" as const, session: null };
  }
  return { state, phase: "connected" as const, session };
};

const readSharedActiveState = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
) => {
  const personal = await readActiveState(key, configuration);
  if (personal.phase !== "idle" || key === SYSTEM_STATE_KEY) return personal;

  const system = await readActiveState(SYSTEM_STATE_KEY, configuration);
  return system.phase === "connected" ? system : personal;
};

const safeIpAddress = (context: Context) => {
  const candidate = (context.ip || "").trim();
  return /^[a-f0-9:.]{3,64}$/i.test(candidate) ? candidate : "0.0.0.0";
};

const authError = (payload: JsonRecord, verifying: boolean) => {
  const body = asRecord(payload.body);
  const userDetails = asRecord(body.userDetails);
  if (isTruthy(userDetails.isLocked)) return "حساب UNO مقفل مؤقتًا.";
  if (isTruthy(userDetails.isPassWordInvalid)) return "بيانات دخول UNO غير صحيحة.";
  if (verifying) return "رمز التحقق غير صحيح أو منتهي.";
  return "تعذر تسجيل الدخول إلى UNO.";
};

const postUnoAuth = async (
  configuration: ReturnType<typeof readConfiguration>,
  ipAddress: string,
  loginStep: 0 | 1,
  otp = "",
) => {
  const endpoint = new URL(AUTH_PATH, configuration.apiBaseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      AppVersion: configuration.appVersion,
    },
    body: JSON.stringify({
      userEmail: configuration.username,
      password: createHash("sha256").update(configuration.password).digest("hex"),
      ipAddress,
      loginStep,
      otp,
      CompanyId: configuration.companyId,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = asRecord(await response.json().catch(() => ({})));
  return { response, payload };
};

const propertyList = (userDetails: JsonRecord) => {
  const properties = firstArray(userDetails, [
    "properties",
    "Properties",
    "propertyList",
    "propertyDetails",
    "assignedProperties",
  ]);
  return properties
    .map((property) => {
      if (typeof property === "string" || typeof property === "number") {
        const id = asString(property);
        return id ? { id, name: id } : null;
      }
      const record = asRecord(property);
      const id = firstValue(record, ["propertyID", "propertyId", "id", "code"]);
      if (!id) return null;
      return {
        id,
        name: firstValue(record, ["name", "propertyName", "hotelName", "code"]) || id,
      };
    })
    .filter((property): property is { id: string; name: string } => Boolean(property));
};

const tokenExpiry = (token: string, body: JsonRecord) => {
  const maximum = Date.now() + UNO_SESSION_TTL_MS;
  const ttlMinutes = asNumber(body.tExpiryMinutes);
  const ttlExpiry = ttlMinutes > 0 ? Date.now() + ttlMinutes * 60_000 : maximum;
  let jwtExpiry = maximum;
  try {
    const payload = asRecord(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")));
    const exp = asNumber(payload.exp);
    if (exp > 0) jwtExpiry = exp * 1000;
  } catch {
    // UNO can return an opaque token; the configured session limit still applies.
  }
  return Math.min(maximum, ttlExpiry, jwtExpiry);
};

const refreshTokenId = (token: string, fallback: string) => {
  try {
    const payload = asRecord(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")));
    const nameId = firstValue(payload, ["nameid", "nameId"]);
    const tokenUserId = nameId.split("_")[1] || nameId;
    return tokenUserId || fallback;
  } catch {
    return fallback;
  }
};

async function refreshConnectedState(
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
  state: ConnectedState,
  session: UnoSession,
) {
  const tokenUserId = refreshTokenId(session.token, session.userId);
  if (!tokenUserId) return null;

  try {
    const endpoint = new URL(
      `AuthenticateUser/RefreshToken/${encodeURIComponent(tokenUserId)}`,
      configuration.apiBaseUrl,
    );
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        AppVersion: configuration.appVersion,
        Authorization: `Bearer ${session.token}`,
        SessionID: session.sessionId,
        UserId: session.userId,
        IPAddress: session.ipAddress,
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    const payload = asRecord(await response.json().catch(() => ({})));
    const body = asRecord(payload.body);
    const userDetails = asRecord(body.userDetails);
    const token = firstValue(body, ["userToken", "token", "accessToken"])
      || firstValue(userDetails, ["userToken", "token", "accessToken"]);
    if (!token) return null;

    const refreshedSession: UnoSession = {
      ...session,
      token,
      userId: firstValue(userDetails, ["userID", "UserID", "userId"]) || session.userId,
      sessionId: firstValue(userDetails, ["userSessionId", "UserSessionID", "sessionId"])
        || session.sessionId,
      ipAddress: firstValue(userDetails, ["ipAddress", "IPAddress"]) || session.ipAddress,
    };
    const expiresAt = tokenExpiry(token, body);
    if (expiresAt <= Date.now()) return null;

    const refreshedState: ConnectedState = {
      ...state,
      expiresAt,
      encrypted: encryptSession(refreshedSession, configuration.password),
    };
    await setState(key, refreshedState);
    return { state: refreshedState, session: refreshedSession };
  } catch {
    return null;
  }
}

const sessionFromAuth = (payload: JsonRecord, fallbackIp: string) => {
  const body = asRecord(payload.body);
  const userDetails = asRecord(body.userDetails);
  const token = firstValue(body, ["userToken", "token", "accessToken"])
    || firstValue(userDetails, ["userToken", "token", "accessToken"]);
  if (!token || isExplicitFalse(body.isValidUser)) return null;
  const firstName = firstValue(userDetails, ["firstName", "FirstName"]);
  const lastName = firstValue(userDetails, ["lastName", "LastName"]);
  const accountName = [firstName, lastName].filter(Boolean).join(" ")
    || firstValue(userDetails, ["userName", "UserName", "emailID", "EmailID"]);

  const session: UnoSession = {
    token,
    userId: firstValue(userDetails, ["userID", "UserID", "userId"])
      || firstValue(body, ["userID", "UserID", "userId"]),
    sessionId: firstValue(userDetails, ["userSessionId", "UserSessionID", "sessionId"])
      || firstValue(body, ["userSessionId", "UserSessionID", "sessionId"]),
    ipAddress: firstValue(userDetails, ["ipAddress", "IPAddress"])
      || firstValue(body, ["ipAddress", "IPAddress"])
      || fallbackIp,
    chainId: firstValue(userDetails, ["chainId", "ChainID"])
      || firstValue(body, ["chainId", "ChainID"])
      || "1",
    accountName,
    properties: propertyList(userDetails),
  };
  return session.userId && session.sessionId ? { session, body } : null;
};

const saveConnectedState = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
  session: UnoSession,
  body: JsonRecord,
  reportFilters: UnoReportFilters,
) => {
  const connectedAt = Date.now();
  const expiresAt = tokenExpiry(session.token, body);
  const state: ConnectedState = {
    phase: "connected",
    connectedAt,
    expiresAt,
    encrypted: encryptSession(session, configuration.password),
    reportFilters,
  };
  await setState(key, state);
  if (key !== SYSTEM_STATE_KEY) {
    await setState(SYSTEM_STATE_KEY, {
      ...state,
      reportFilters: currentMonthUnoSyncFilters(),
    });
  }
  return state;
};

const hasOtpChallenge = (payload: JsonRecord) => {
  const body = asRecord(payload.body);
  const description = [
    asString(payload.description),
    asString(body.description),
    asString(body.message),
  ].join(" ").toUpperCase();
  return (isTruthy(payload.status) || isTruthy(body.status))
    && !isExplicitFalse(body.isValidUser)
    && !firstValue(body, ["userToken", "token", "accessToken"])
    && (description.includes("OTP") || isTruthy(body.isOtpRequired));
};

const connect = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
  context: Context,
  reportFilters: UnoReportFilters,
) => {
  if (!configuration.configured) return json({ error: "إعدادات UNO غير مكتملة." }, 503);
  try {
    const ipAddress = safeIpAddress(context);
    const { response, payload } = await postUnoAuth(configuration, ipAddress, 0);
    const connected = sessionFromAuth(payload, ipAddress);
    if (response.ok && connected) {
      const state = await saveConnectedState(key, configuration, connected.session, connected.body, reportFilters);
      return finalizeAuthenticatedConnection(key, configuration, connected.session, state);
    }
    if (response.ok && hasOtpChallenge(payload)) {
      const now = Date.now();
      const state: PendingState = {
        phase: "otp",
        pendingAt: now,
        expiresAt: now + OTP_TTL_MS,
        resendAt: now + OTP_RESEND_DELAY_MS,
        ipAddress,
        attempts: 0,
        reportFilters,
      };
      await setState(key, state);
      return json(publicStatus(configuration, "otp", state));
    }
    return json({ error: authError(payload, false) }, response.status === 429 ? 429 : 401);
  } catch {
    return json({ error: "تعذر الوصول إلى UNO." }, 502);
  }
};

const verifyOtp = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
  otp: string,
) => {
  if (!/^[a-z0-9]{4,12}$/i.test(otp)) return json({ error: "أدخل رمز تحقق صحيحًا." }, 400);
  const active = await readActiveState(key, configuration);
  if (active.phase !== "otp" || active.state?.phase !== "otp") {
    return json({ error: "انتهت مهلة رمز التحقق.", ...publicStatus(configuration, "idle") }, 409);
  }
  try {
    const { response, payload } = await postUnoAuth(configuration, active.state.ipAddress, 1, otp);
    const connected = sessionFromAuth(payload, active.state.ipAddress);
    if (response.ok && connected) {
      const state = await saveConnectedState(
        key,
        configuration,
        connected.session,
        connected.body,
        active.state.reportFilters || defaultReportFilters(),
      );
      return finalizeAuthenticatedConnection(key, configuration, connected.session, state);
    }
    const attempts = (active.state.attempts || 0) + 1;
    if (attempts >= 5) {
      await clearState(key);
      return json({
        error: "تم إيقاف المحاولة. ابدأ الاتصال من جديد.",
        ...publicStatus(configuration, "idle"),
      }, 429);
    }
    await setState(key, { ...active.state, attempts });
    return json({ error: authError(payload, true) }, 401);
  } catch {
    return json({ error: "تعذر التحقق من الرمز." }, 502);
  }
};

const resendOtp = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
) => {
  const active = await readActiveState(key, configuration);
  if (active.phase !== "otp" || active.state?.phase !== "otp") {
    return json({ error: "ابدأ الاتصال من جديد.", ...publicStatus(configuration, "idle") }, 409);
  }
  if (active.state.resendAt > Date.now()) {
    return json({
      error: "انتظر قبل إعادة الإرسال.",
      ...publicStatus(configuration, "otp", active.state),
    }, 429);
  }
  try {
    const { response, payload } = await postUnoAuth(configuration, active.state.ipAddress, 0);
    if (!response.ok || !hasOtpChallenge(payload)) {
      return json({ error: authError(payload, false) }, response.status === 429 ? 429 : 401);
    }
    const now = Date.now();
    const state: PendingState = {
      ...active.state,
      pendingAt: now,
      expiresAt: now + OTP_TTL_MS,
      resendAt: now + OTP_RESEND_DELAY_MS,
      attempts: 0,
    };
    await setState(key, state);
    return json(publicStatus(configuration, "otp", state));
  } catch {
    return json({ error: "تعذر إعادة إرسال الرمز." }, 502);
  }
};

const normalizeComparable = (value: string) => value.toLocaleLowerCase().replace(/[\s\-()]/g, "");
const normalizePhone = (value: string) => value.replace(/\D/g, "");

const reservationArrays = (payload: unknown, depth = 0): JsonRecord[][] => {
  if (depth > 4) return [];
  if (Array.isArray(payload)) {
    const records = payload.map(asRecord).filter((record) => Object.keys(record).length > 0);
    return records.length ? [records] : [];
  }
  const record = asRecord(payload);
  return Object.values(record).flatMap((value) => reservationArrays(value, depth + 1));
};

const reservationStatus = (value: string) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric === -1) return "ملغي";
    if (numeric === 1) return "مؤكد";
    if (numeric === 2) return "عدم حضور";
    if (numeric === 10) return "حجز مؤقت";
  }
  return value;
};

export const normalizeReservation = (record: JsonRecord): NormalizedReservation => {
  const firstName = firstValue(record, ["firstName", "FirstName", "guestFirstName"]);
  const middleName = firstValue(record, ["middleName", "MiddleName", "guestMiddleName"]);
  const lastName = firstValue(record, ["lastName", "LastName", "guestLastName"]);
  const guestName = firstValue(record, ["guestName", "GuestName", "customerName"])
    || [firstName, middleName, lastName].filter(Boolean).join(" ");
  const amount = firstValue(record, [
    "amountAfterTax",
    "AmountAfterTax",
    "amountBeforeTax",
    "totalPrice",
    "TotalPrice",
    "totalAmount",
  ]);

  return {
    unoNumber: firstValue(record, [
      "reservationNo",
      "ReservationNo",
      "reservationNumber",
      "ReservationNumber",
      "unoReservationNo",
      "otaBookingID",
      "OTABookingID",
    ]),
    pmsNumber: firstValue(record, [
      "pmsid",
      "pmsId",
      "PMSID",
      "pmsConfirmationNo",
      "PMSConfirmationNo",
      "pmsReservationNo",
    ]),
    phone: deepFirstValue(record, [
      "phoneNo",
      "PhoneNo",
      "phoneNumber",
      "PhoneNumber",
      "mobile",
      "Mobile",
      "mobileNumber",
      "guestPhone",
      "contactNo",
    ]),
    guestName,
    agentName: firstValue(record, [
      "createdBy",
      "CreatedBy",
      "createdByName",
      "CreatedByName",
      "agentName",
      "AgentName",
      "userName",
      "UserName",
    ]),
    property: firstValue(record, ["name", "propertyName", "PropertyName", "hotelName"]),
    city: firstValue(record, ["city", "City", "cityName", "CityName", "propertyCity"]),
    status: reservationStatus(firstValue(record, [
      "statusName",
      "reservationStatus",
      "resStatus",
      "status",
    ])),
    checkIn: firstValue(record, ["checkIn", "CheckIn", "checkInDate", "arrivalDate"]),
    checkOut: firstValue(record, ["checkOut", "CheckOut", "checkOutDate", "departureDate"]),
    bookingDate: firstValue(record, [
      "reservationDate",
      "ReservationDate",
      "bookingDate",
      "createdDate",
      "createdAt",
    ]),
    channel: firstValue(record, ["channelName", "ChannelName", "source", "bookingSource"]),
    amount,
    currency: firstValue(record, ["currency", "Currency", "currencyCode"]),
  };
};

const matchesSearch = (reservation: NormalizedReservation, field: UnoSearchField, query: string) => {
  if (field === "phone") {
    const expected = normalizePhone(query);
    const actual = normalizePhone(reservation.phone);
    return actual.endsWith(expected) || expected.endsWith(actual);
  }
  const expected = normalizeComparable(query);
  const actual = normalizeComparable(field === "pms" ? reservation.pmsNumber : reservation.unoNumber);
  return actual.includes(expected);
};

export const createReservationSearchPayload = (
  session: Pick<UnoSession, "chainId" | "properties">,
  field?: UnoSearchField,
  query = "",
  filters?: UnoReportFilters,
) => {
  const selectedProperties = filters?.property && filters.property !== "all"
    ? session.properties.filter((property) => property.name === filters.property)
    : session.properties;
  const propertyIds = selectedProperties.map((property) => property.id);
  const bookingStatus = filters?.status === "confirmed"
    ? 1
    : filters?.status === "cancelled"
      ? -1
      : filters?.status === "modified"
        ? 3
        : 0;
  const payload: JsonRecord = {
    ChainID: session.chainId,
    propertyIds,
    BookingStatus: bookingStatus,
    Channel: "0",
    SourceType: "Voice",
    searchText: query,
    isExcelDownload: false,
  };
  if (filters?.dateType === "checkin") {
    payload.checkinDateFrom = filters.from;
    payload.checkinDateTo = filters.to;
  } else if (filters?.dateType === "checkout") {
    payload.checkoutDateFrom = filters.from;
    payload.checkoutDateTo = filters.to;
  } else if (filters) {
    payload.bookingDateFrom = filters.from;
    payload.bookingDateTo = filters.to;
  }
  return payload;
};

const createLegacyReservationSearchPayload = (
  session: Pick<UnoSession, "chainId" | "properties">,
  field?: UnoSearchField,
  query = "",
  filters?: UnoReportFilters,
) => {
  const payload = createReservationSearchPayload(session, field, query, filters);
  const propertyIds = Array.isArray(payload.propertyIds)
    ? payload.propertyIds.map((value) => asString(value)).filter(Boolean)
    : [];
  return {
    ...payload,
    chainID: session.chainId,
    propertyId: propertyIds.join(","),
    bookingStatus: [],
    channelId: [],
    paymentStatus: [],
    filterBy: "1",
    oTABookingId: field === "uno" ? query : "",
    reservationNo: field === "uno" ? query : "",
    pmsid: field === "pms" ? query : "",
    pmsConfirmationNo: field === "pms" ? query : "",
    phoneNo: field === "phone" ? query : "",
    phoneNumber: field === "phone" ? query : "",
    mobileNumber: field === "phone" ? query : "",
  };
};

const unoHeaders = (session: UnoSession, configuration: ReturnType<typeof readConfiguration>) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  AppVersion: configuration.appVersion,
  Authorization: `Bearer ${session.token}`,
  SessionID: session.sessionId,
  UserId: session.userId,
  IPAddress: session.ipAddress,
});

const voiceHeaders = (session: UnoSession) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Bearer ${session.token}`,
  UserID: "VOICE",
});

const enrichPhoneReservations = async (
  configuration: ReturnType<typeof readConfiguration>,
  session: UnoSession,
  records: JsonRecord[],
) => {
  const enriched: JsonRecord[] = [];
  const pending = records.slice(0, 50);
  for (let index = 0; index < pending.length; index += 5) {
    const batch = pending.slice(index, index + 5);
    const details = await Promise.all(batch.map(async (record) => {
      if (normalizeReservation(record).phone) return record;
      const reservationNo = firstValue(record, [
        "reservationNo",
        "ReservationNo",
        "reservationNumber",
        "ReservationNumber",
      ]);
      const propertyId = firstValue(record, [
        "propertyId",
        "propertyID",
        "PropertyId",
        "PropertyID",
      ]) || session.properties[0]?.id || "";
      if (!reservationNo || !propertyId) return record;

      const endpoint = new URL("Reservation/getReservationDetails", configuration.apiBaseUrl);
      endpoint.search = new URLSearchParams({
        reservatioNO: reservationNo,
        propertyID: propertyId,
      }).toString();
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: unoHeaders(session, configuration),
          body: "{}",
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) return record;
        const payload = await response.json().catch(() => ({}));
        return { ...record, reservationDetails: payload };
      } catch {
        return record;
      }
    }));
    enriched.push(...details);
  }
  return enriched;
};

const fetchReservations = async (
  configuration: ReturnType<typeof readConfiguration>,
  session: UnoSession,
  field?: UnoSearchField,
  query = "",
  reportFilters?: UnoReportFilters,
) => {
  const searchPayload = createReservationSearchPayload(session, field, query, reportFilters);
  const legacySearchPayload = createLegacyReservationSearchPayload(session, field, query, reportFilters);
  let unauthorized = false;
  let lastStatus = 502;

  const voiceEndpoint = new URL(VOICE_SEARCH_PATH, configuration.voiceApiBaseUrl);
  voiceEndpoint.search = new URLSearchParams({
    isforPageSize: "false",
    page: "1",
    pageSize: field ? String(SEARCH_LIMIT) : "-1",
    isBookingDateUsed: String(reportFilters?.dateType === "booking"),
    ServerSidePagination: "false",
  }).toString();
  try {
    const response = await fetch(voiceEndpoint, {
      method: "POST",
      headers: voiceHeaders(session),
      body: JSON.stringify(searchPayload),
      signal: AbortSignal.timeout(25_000),
    });
    lastStatus = response.status;
    if (response.status === 401 || response.status === 403) unauthorized = true;
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const body = asRecord(asRecord(payload).body);
      const hasOfficialRecords = Array.isArray(body.reservationsRecords);
      const officialRecords = hasOfficialRecords
        ? body.reservationsRecords as JsonRecord[]
        : [];
      const candidates = hasOfficialRecords
        ? officialRecords
        : reservationArrays(payload).sort((left, right) => right.length - left.length)[0] || [];
      if (hasOfficialRecords || candidates.length) {
        const searchableRecords = field === "phone"
          ? await enrichPhoneReservations(configuration, session, candidates)
          : candidates.slice(0, field ? SEARCH_LIMIT : UNO_REPORT_LIMIT);
        const reservations = searchableRecords
          .map(normalizeReservation)
          .filter((reservation) => (
            field
              ? matchesSearch(reservation, field, query)
              : Boolean(
                reservation.unoNumber
                || reservation.pmsNumber
                || reservation.phone
                || reservation.guestName,
              )
          ));
        return { reservations, unauthorized: false, status: response.status };
      }
    }
    if (!response.ok) {
      console.warn("UNO reservation request failed", {
        provider: "voice",
        status: response.status,
        path: voiceEndpoint.pathname,
      });
    }
  } catch (error) {
    console.warn("UNO reservation request failed", {
      provider: "voice",
      code: error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK",
      path: voiceEndpoint.pathname,
    });
  }

  for (const path of LEGACY_SEARCH_PATHS) {
    const endpoint = new URL(path, configuration.apiBaseUrl);
    endpoint.search = new URLSearchParams({
      isforPageSize: "false",
      page: "1",
      pageSize: field ? String(SEARCH_LIMIT) : "-1",
      isBookingDateUsed: String(reportFilters?.dateType === "booking"),
      ServerSidePagination: "false",
    }).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: unoHeaders(session, configuration),
      body: JSON.stringify(legacySearchPayload),
      signal: AbortSignal.timeout(25_000),
    });
    lastStatus = response.status;
    if (response.status === 401 || response.status === 403) {
      unauthorized = true;
      continue;
    }
    if (!response.ok) continue;

    const payload = await response.json().catch(() => ({}));
    const candidates = reservationArrays(payload)
      .sort((left, right) => right.length - left.length)[0] || [];
    const searchableRecords = field === "phone"
      ? await enrichPhoneReservations(configuration, session, candidates)
      : candidates.slice(0, field ? SEARCH_LIMIT : UNO_REPORT_LIMIT);
    const reservations = searchableRecords
      .map(normalizeReservation)
      .filter((reservation) => (
        field
          ? matchesSearch(reservation, field, query)
          : Boolean(
            reservation.unoNumber
            || reservation.pmsNumber
            || reservation.phone
            || reservation.guestName,
          )
      ));
    return { reservations, unauthorized: false, status: response.status };
  }
  return { reservations: [], unauthorized, status: lastStatus };
};

const reportStatusGroup = (value: string): UnoReportStatus | "other" => {
  const normalized = value.trim().toLocaleLowerCase("en");
  if (normalized === "3" || /modif|معدل|معدّل/.test(normalized)) return "modified";
  if (["-1", "c", "ns"].includes(normalized) || /cancel|no[\s-]?show|ملغ|عدم حضور/.test(normalized)) return "cancelled";
  if (["1", "m", "o", "n", "i"].includes(normalized) || /confirm|مؤكد/.test(normalized)) return "confirmed";
  return "other";
};

const reservationDateKey = (value: string) => {
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (direct) return direct;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

export const filterReservationsForReport = (
  reservations: NormalizedReservation[],
  filters: UnoReportFilters,
) => reservations.filter((reservation) => {
  if (filters.property !== "all" && reservation.property !== filters.property) return false;
  const status = reportStatusGroup(reservation.status);
  if (filters.status !== "all" && status !== filters.status) return false;
  const date = reservationDateKey(
    filters.dateType === "checkin"
      ? reservation.checkIn
      : filters.dateType === "checkout"
        ? reservation.checkOut
        : reservation.bookingDate,
  );
  return Boolean(date && date >= filters.from && date <= filters.to);
});

const REPORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const reportDateValue = (value: string, includeTime = false) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const day = parsed.getUTCDate();
  const month = REPORT_MONTHS[parsed.getUTCMonth()];
  const year = String(parsed.getUTCFullYear()).slice(-2);
  if (!includeTime) return `${day} ${month} ${year}`;
  const hour = String(parsed.getUTCHours()).padStart(2, "0");
  const minute = String(parsed.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hour}:${minute}`;
};

const bookingStatusForReport = (value: string) => {
  const group = reportStatusGroup(value);
  if (group === "confirmed") return "Confirmed";
  if (group === "cancelled") return "Cancelled";
  if (group === "modified") return "Modified";
  return value;
};

export const reservationToBookingRecord = (reservation: NormalizedReservation): BookingRecord => ({
  "Booking time": reportDateValue(reservation.bookingDate, true),
  "Guest Name": reservation.guestName,
  "Agent Name": reservation.agentName,
  "Resv. no.": reservation.unoNumber || reservation.pmsNumber,
  "Check-in": reportDateValue(reservation.checkIn),
  "Check-out": reportDateValue(reservation.checkOut),
  "Booking Status": bookingStatusForReport(reservation.status),
  Property: reservation.property,
  City: reservation.city,
  Channel: reservation.channel,
  Amount: reservation.amount,
  Currency: reservation.currency,
});

const publishProductivityReport = async (
  reservations: NormalizedReservation[],
  filters: UnoReportFilters,
): Promise<{ published: true; stats: BookingSaveResult } | { published: false; error: string }> => {
  if (!reservations.length) {
    return { published: false, error: "لا توجد حجوزات UNO ضمن فترة التقرير المحددة." };
  }
  if (!reservations.some((reservation) => reservation.agentName.trim())) {
    return { published: false, error: "أعاد UNO الحجوزات بدون Agent Name؛ لم يتم استبدال تقرير إنتاجية الموظفين." };
  }
  try {
    const stats = await saveBookingRecords(
      reservations.map(reservationToBookingRecord),
      `uno-live-${filters.from}-${filters.to}.csv`,
    );
    return { published: true, stats };
  } catch (error) {
    return {
      published: false,
      error: error instanceof Error ? error.message : "تعذر حفظ تقرير إنتاجية UNO.",
    };
  }
};

type UnoProductivityResult = Awaited<ReturnType<typeof publishProductivityReport>>
  | { published: false; skipped: true; error?: undefined };

const saveReservationSnapshot = async (
  reservations: NormalizedReservation[],
  source: "automatic" | "manual",
  sessionExpiresAt?: string,
  reportFilters?: UnoReportFilters,
  productivity?: UnoSnapshot["productivity"],
  persist = true,
): Promise<UnoSnapshot> => {
  const deduplicated = new Map<string, NormalizedReservation>();
  reservations.forEach((reservation, index) => {
    const key = [
      reservation.unoNumber,
      reservation.pmsNumber,
    ].filter(Boolean).join("|") || [
      reservation.phone,
      reservation.guestName,
      reservation.property,
      reservation.checkIn,
      index,
    ].join("|");
    deduplicated.set(key, reservation);
  });
  const normalizedReservations = Array.from(deduplicated.values()).slice(0, UNO_SNAPSHOT_LIMIT);
  const snapshot = {
    reservations: normalizedReservations,
    total: normalizedReservations.length,
    syncedAt: new Date().toISOString(),
    source,
    sessionExpiresAt: sessionExpiresAt || null,
    reportFilters,
    productivity,
  };
  if (persist) await snapshotStore().setJSON("latest", snapshot);
  return snapshot;
};

const exportLiveReport = async (
  configuration: ReturnType<typeof readConfiguration>,
  session: UnoSession,
  sessionExpiresAt: string,
  source: "automatic" | "manual",
  reportFilters: UnoReportFilters,
) => {
  const result = await fetchReservations(configuration, session, undefined, "", reportFilters);
  if (result.unauthorized) {
    return { ok: false as const, unauthorized: true, error: "انتهت جلسة UNO قبل جلب التقرير." };
  }
  if (result.status < 200 || result.status >= 300) {
    return { ok: false as const, unauthorized: false, error: `رفض UNO طلب التقرير (${result.status}).` };
  }
  const reportReservations = filterReservationsForReport(result.reservations, reportFilters);
  const canonicalUpdated = isCanonicalUnoSyncFilters(reportFilters);
  const productivity: UnoProductivityResult = canonicalUpdated
    ? await publishProductivityReport(reportReservations, reportFilters)
    : { published: false, skipped: true };
  const productivityState: UnoSnapshot["productivity"] = productivity.published
    ? {
        published: true,
        updatedAt: productivity.stats.updatedAt,
        records: productivity.stats.classifiedTotal,
        employees: productivity.stats.employeeCount,
      }
    : { published: false, error: productivity.error };
  const snapshot = await saveReservationSnapshot(
    reportReservations,
    source,
    sessionExpiresAt,
    reportFilters,
    productivityState,
    canonicalUpdated,
  );
  return { ok: true as const, snapshot, productivity, canonicalUpdated };
};

async function finalizeAuthenticatedConnection(
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
  session: UnoSession,
  state: ConnectedState,
) {
  const canonicalFilters = currentMonthUnoSyncFilters();
  await markSyncAttempt().catch(() => undefined);
  try {
    const exported = await exportLiveReport(
      configuration,
      session,
      new Date(state.expiresAt).toISOString(),
      "manual",
      canonicalFilters,
    );
    if (!exported.ok) {
      if (exported.unauthorized) {
        await Promise.all([
          clearState(key),
          clearState(SYSTEM_STATE_KEY),
          markSyncFailure(exported.error, true).catch(() => undefined),
        ]);
        return json({
          error: exported.error,
          reportReady: false,
          ...publicStatus(configuration, "idle"),
        }, 401);
      }
      await markSyncFailure(exported.error).catch(() => undefined);
      return json({
        ...publicStatus(configuration, "connected", state, session),
        reportReady: false,
        reportError: exported.error,
      });
    }
    await markSyncSuccess("manual", exported.snapshot.total, canonicalFilters).catch(() => undefined);
    return json(await statusWithSnapshot(configuration, "connected", state, session));
  } catch {
    await markSyncFailure("تعذر جلب تقرير UNO بعد التحقق.").catch(() => undefined);
    return json({
      ...publicStatus(configuration, "connected", state, session),
      reportReady: false,
      reportError: "تم التحقق من UNO، لكن تعذر جلب التقرير الآن.",
    });
  }
}

const syncSystemSnapshot = async (
  configuration: ReturnType<typeof readConfiguration>,
) => {
  await markSyncAttempt().catch(() => undefined);
  const active = await readActiveState(SYSTEM_STATE_KEY, configuration);
  if (active.phase !== "connected" || !active.session || active.state?.phase !== "connected") {
    await markSyncFailure("انتهت جلسة UNO وتحتاج إلى تحقق OTP جديد.", true).catch(() => undefined);
    return json({
      error: "UNO verification required",
      requiresOtp: true,
      staleDataPreserved: true,
    }, 409);
  }

  try {
    const canonicalFilters = currentMonthUnoSyncFilters();
    await setState(SYSTEM_STATE_KEY, {
      ...active.state,
      reportFilters: canonicalFilters,
    });
    const exported = await exportLiveReport(
      configuration,
      active.session,
      new Date(active.state.expiresAt).toISOString(),
      "automatic",
      canonicalFilters,
    );
    if (!exported.ok && exported.unauthorized) {
      await Promise.all([
        clearState(SYSTEM_STATE_KEY),
        markSyncFailure("انتهت جلسة UNO وتحتاج إلى تحقق OTP جديد.", true).catch(() => undefined),
      ]);
      return json({
        error: "UNO session expired",
        requiresOtp: true,
        staleDataPreserved: true,
      }, 409);
    }
    if (!exported.ok) {
      await markSyncFailure(exported.error).catch(() => undefined);
      return json({ error: exported.error, staleDataPreserved: true }, 502);
    }
    await markSyncSuccess("automatic", exported.snapshot.total, canonicalFilters).catch(() => undefined);
    return json({
      ok: true,
      total: exported.snapshot.total,
      syncedAt: exported.snapshot.syncedAt,
      productivityReady: exported.productivity.published,
    });
  } catch {
    await markSyncFailure("تعذر الوصول إلى UNO أثناء المزامنة المجدولة.").catch(() => undefined);
    return json({ error: "UNO sync unavailable" }, 502);
  }
};

const keepSystemSessionAlive = async (
  configuration: ReturnType<typeof readConfiguration>,
) => {
  const active = await readActiveState(SYSTEM_STATE_KEY, configuration);
  if (active.phase !== "connected" || active.state?.phase !== "connected" || !active.session) {
    await markSyncFailure("انتهت جلسة UNO وتحتاج إلى تحقق OTP جديد.", true).catch(() => undefined);
    return json({
      error: "UNO verification required",
      requiresOtp: true,
      staleDataPreserved: true,
    }, 409);
  }

  return json({
    ok: true,
    connected: true,
    expiresAt: new Date(active.state.expiresAt).toISOString(),
  });
};

const searchReservations = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
  field: unknown,
  query: unknown,
) => {
  if (!["phone", "pms", "uno"].includes(asString(field))) {
    return json({ error: "نوع البحث غير صحيح." }, 400);
  }
  const searchField = asString(field) as UnoSearchField;
  const searchQuery = asString(query);
  const minimumLength = searchField === "phone" ? 7 : 3;
  if (searchQuery.length < minimumLength || searchQuery.length > 80) {
    return json({ error: "أدخل رقم بحث صحيحًا." }, 400);
  }

  const active = await readSharedActiveState(key, configuration);
  if (active.phase !== "connected" || !active.session) {
    return json({ error: "اتصل بـ UNO أولًا.", ...publicStatus(configuration, "idle") }, 409);
  }

  try {
    const result = await fetchReservations(configuration, active.session, searchField, searchQuery);
    if (result.unauthorized) {
      await clearState(key);
      return json({ error: "انتهت جلسة UNO.", ...publicStatus(configuration, "idle") }, 401);
    }
    if (result.status < 200 || result.status >= 300) return json({ error: `رفض UNO طلب البحث (${result.status}).` }, 502);
    return json({
      reservations: result.reservations,
      total: result.reservations.length,
      searchedAt: new Date().toISOString(),
    });
  } catch {
    return json({ error: "تعذر تحميل حجوزات UNO." }, 502);
  }
};

const listReservations = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
  requestedFilters?: unknown,
) => {
  const active = await readSharedActiveState(key, configuration);
  if (active.phase !== "connected" || !active.session) {
    return json({ error: "اتصل بـ UNO أولًا.", ...publicStatus(configuration, "idle") }, 409);
  }

  let reportFilters = active.state?.phase === "connected"
    ? active.state.reportFilters || defaultReportFilters()
    : defaultReportFilters();
  if (requestedFilters !== undefined) {
    try {
      reportFilters = parseUnoReportFilters(requestedFilters);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "فلاتر التقرير غير صحيحة." }, 400);
    }
    if (active.state?.phase === "connected") {
      const nextState: ConnectedState = { ...active.state, reportFilters };
      await setState(key, nextState);
    }
  }

  try {
    const exported = await exportLiveReport(
      configuration,
      active.session,
      active.state?.phase === "connected" ? new Date(active.state.expiresAt).toISOString() : "",
      "manual",
      reportFilters,
    );
    if (!exported.ok && exported.unauthorized) {
      await clearState(key);
      return json({ error: "انتهت جلسة UNO.", ...publicStatus(configuration, "idle") }, 401);
    }
    if (!exported.ok) return json({ error: exported.error }, 502);
    const snapshot = exported.snapshot;
    if (exported.canonicalUpdated) {
      await markSyncSuccess("manual", snapshot.total, reportFilters).catch(() => undefined);
    }
    return json({
      reservations: snapshot.reservations,
      total: snapshot.total,
      searchedAt: snapshot.syncedAt,
      syncedAt: snapshot.syncedAt,
      reportReady: true,
      reportFilters,
      canonicalUpdated: exported.canonicalUpdated,
      productivityReady: exported.productivity.published,
      productivityUpdatedAt: exported.productivity.published ? exported.productivity.stats.updatedAt : undefined,
      productivityRecords: exported.productivity.published ? exported.productivity.stats.classifiedTotal : undefined,
      productivityEmployees: exported.productivity.published ? exported.productivity.stats.employeeCount : undefined,
      reportError: exported.productivity.published ? undefined : exported.productivity.error,
    });
  } catch {
    return json({ error: "تعذر تحميل حجوزات UNO." }, 502);
  }
};

export default async (req: Request, context: Context) => {
  const configuration = readConfiguration();

  if (req.method === "POST" && isInternalSyncRequest(req, configuration)) {
    const body = asRecord(await req.json().catch(() => ({})));
    const action = asString(body.action);
    if (action === "sync-system") return syncSystemSnapshot(configuration);
    if (action === "keepalive-system") return keepSystemSessionAlive(configuration);
    return json({ error: "Permission Denied" }, 403);
  }

  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (!["superadmin", "admin"].includes(session.role)) return json({ error: "Permission Denied" }, 403);

  const key = stateKey(req);
  if (!key) return json({ error: "Unauthorized" }, 401);

  if (req.method === "GET") {
    const active = await readSharedActiveState(key, configuration);
    return json(await statusWithSnapshot(configuration, active.phase, active.state, active.session));
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = asRecord(await req.json().catch(() => ({})));
  const action = asString(body.action);
  if (action === "connect") {
    try {
      return connect(key, configuration, context, parseUnoReportFilters(body.filters));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "فلاتر التقرير غير صحيحة." }, 400);
    }
  }
  if (action === "verify") return verifyOtp(key, configuration, asString(body.otp));
  if (action === "resend") return resendOtp(key, configuration);
  if (action === "disconnect") {
    await Promise.all([clearState(key), clearState(SYSTEM_STATE_KEY)]);
    return json(publicStatus(configuration, "idle"));
  }
  if (action === "search") {
    return searchReservations(key, configuration, body.field, body.query);
  }
  if (action === "list") return listReservations(key, configuration);
  if (action === "export") return listReservations(key, configuration, body.filters);
  return json({ error: "الإجراء غير صحيح." }, 400);
};

export const config: Config = {
  path: "/api/admin/uno",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
  },
};
