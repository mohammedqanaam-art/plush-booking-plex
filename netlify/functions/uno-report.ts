import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { saveBookingRecords, type BookingRecord } from "./_shared/bookingCsv";
import { getSessionToken, json, requireSameOrigin, validateSession } from "./_shared/security";
import {
  deduplicateUnoReservations,
  filterUnoReservations,
  riyadhReportDate,
  summarizeUnoReservations,
  unoStatusGroup,
  type UnoReportFilters,
  type UnoReservationRecord,
} from "./_shared/unoReportCore";
import {
  currentMonthUnoSyncFilters,
  isTrustedRateGainUrl,
  normalizeReservation,
  parseUnoReportFilters,
} from "./uno-connection";

const DEFAULT_UNO_API_BASE_URL = "https://uno-prod-ui-api-cpayzgdkqq-uc.a.run.app/api/";
const DEFAULT_UNO_VOICE_API_BASE_URL = "https://ibe-prod-api-cpayzgdkqq-uc.a.run.app/api/";
const DEFAULT_UNO_APP_VERSION = "29.3";
const VOICE_SEARCH_PATH = "voice/allreservaions";
const SYSTEM_STATE_KEY = "system";
const SYNC_HEALTH_KEY = "sync-health";
const MAX_REPORT_ROWS = 50_000;
const PAGED_SIZE = 1_000;
const MAX_PAGES = 50;
const REFRESH_WINDOW_MS = 45 * 60 * 1000;

type JsonRecord = Record<string, unknown>;
type EncryptedValue = { iv: string; tag: string; data: string };
type ConnectedState = {
  phase: "connected";
  connectedAt: number;
  expiresAt: number;
  encrypted: EncryptedValue;
  reportFilters?: UnoReportFilters;
};
type UnoSession = {
  token: string;
  userId: string;
  sessionId: string;
  ipAddress: string;
  chainId: string;
  accountName: string;
  properties: Array<{ id: string; name: string }>;
};

type FetchQuality = {
  fetchMode: "unbounded" | "paged";
  pages: number;
  sourceRows: number;
  reportedTotal: number | null;
  duplicateReservations: number;
  missingReservationNumber: number;
  truncated: false;
};

const rawEnv = (key: string) => Netlify.env.get(key) || "";
const trimmedEnv = (key: string) => rawEnv(key).trim();
const asString = (value: unknown) => typeof value === "string"
  ? value.trim()
  : typeof value === "number" || typeof value === "bigint"
    ? String(value)
    : "";
const asRecord = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as JsonRecord
  : {};

const safeUnoUrl = (value: string, fallback: string) => isTrustedRateGainUrl(value) ? value : fallback;

const readConfiguration = () => {
  const configuredApi = trimmedEnv("UNO_API_BASE_URL");
  const configuredVoice = trimmedEnv("UNO_VOICE_API_BASE_URL");
  const api = safeUnoUrl(configuredApi, DEFAULT_UNO_API_BASE_URL);
  const voice = safeUnoUrl(configuredVoice, DEFAULT_UNO_VOICE_API_BASE_URL);
  return {
    apiBaseUrl: `${api.replace(/\/+$/, "")}/`,
    voiceApiBaseUrl: `${voice.replace(/\/+$/, "")}/`,
    password: rawEnv("UNO_PASSWORD") || rawEnv("UNO_LOGIN_PASSWORD"),
    appVersion: trimmedEnv("UNO_APP_VERSION") || DEFAULT_UNO_APP_VERSION,
  };
};

const sessionStore = () => Netlify.context?.deploy.context === "production"
  ? getStore({ name: "uno-sessions", consistency: "strong" })
  : getDeployStore("uno-sessions");

const snapshotStore = () => Netlify.context?.deploy.context === "production"
  ? getStore({ name: "uno-reservations", consistency: "strong" })
  : getDeployStore("uno-reservations");

const encryptionKey = (password: string) => createHash("sha256").update(`uno-session:${password}`).digest();

const encryptSession = (session: UnoSession, password: string): EncryptedValue => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(password), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
};

const decryptSession = (encrypted: EncryptedValue, password: string): UnoSession | null => {
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(password), Buffer.from(encrypted.iv, "base64"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as UnoSession;
  } catch {
    return null;
  }
};

const stateKeyFromRequest = (req: Request) => {
  const token = getSessionToken(req);
  return token ? `admin_${createHash("sha256").update(token).digest("hex")}` : "";
};

const syncSecret = (password: string) => trimmedEnv("UNO_SYNC_SECRET")
  || (password ? createHash("sha256").update(`uno-sync:${password}`).digest("hex") : "");

const internalAuthorized = (req: Request, password: string) => {
  const expected = syncSecret(password);
  const provided = req.headers.get("x-uno-sync-key") || "";
  if (!expected || !provided) return false;
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(provided).digest(),
  );
};

const readConnectedState = async (key: string, password: string) => {
  const state = await sessionStore().get(key, { type: "json" }).catch(() => null) as ConnectedState | null;
  if (!state || state.phase !== "connected" || !state.encrypted || !password) return null;
  const session = decryptSession(state.encrypted, password);
  if (!session?.token || !session.userId || !session.sessionId) return null;
  return { state, session };
};

const tokenUserId = (token: string, fallback: string) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as JsonRecord;
    const nameId = asString(payload.nameid || payload.nameId);
    return nameId.split("_")[1] || nameId || fallback;
  } catch {
    return fallback;
  }
};

const tokenExpiry = (token: string, fallback: number) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as JsonRecord;
    const exp = Number(payload.exp);
    return Number.isFinite(exp) && exp > 0 ? Math.min(fallback, exp * 1000) : fallback;
  } catch {
    return fallback;
  }
};

const refreshConnectedState = async (
  key: string,
  state: ConnectedState,
  session: UnoSession,
  configuration: ReturnType<typeof readConfiguration>,
) => {
  if (state.expiresAt > Date.now() + REFRESH_WINDOW_MS) return { state, session };
  const userId = tokenUserId(session.token, session.userId);
  if (!userId) return state.expiresAt > Date.now() ? { state, session } : null;

  try {
    const endpoint = new URL(`AuthenticateUser/RefreshToken/${encodeURIComponent(userId)}`, configuration.apiBaseUrl);
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
    if (!response.ok) return state.expiresAt > Date.now() ? { state, session } : null;
    const payload = asRecord(await response.json().catch(() => ({})));
    const body = asRecord(payload.body);
    const details = asRecord(body.userDetails);
    const token = asString(body.userToken || body.token || body.accessToken || details.userToken || details.token || details.accessToken);
    if (!token) return state.expiresAt > Date.now() ? { state, session } : null;

    const nextSession: UnoSession = {
      ...session,
      token,
      userId: asString(details.userID || details.UserID || details.userId) || session.userId,
      sessionId: asString(details.userSessionId || details.UserSessionID || details.sessionId) || session.sessionId,
      ipAddress: asString(details.ipAddress || details.IPAddress) || session.ipAddress,
    };
    const nextState: ConnectedState = {
      ...state,
      expiresAt: tokenExpiry(token, Date.now() + 12 * 60 * 60 * 1000),
      encrypted: encryptSession(nextSession, configuration.password),
    };
    await sessionStore().setJSON(key, nextState);
    return { state: nextState, session: nextSession };
  } catch {
    return state.expiresAt > Date.now() ? { state, session } : null;
  }
};

const activeSession = async (req: Request, internal: boolean, configuration: ReturnType<typeof readConfiguration>) => {
  const preferredKey = internal ? SYSTEM_STATE_KEY : stateKeyFromRequest(req);
  const preferred = preferredKey ? await readConnectedState(preferredKey, configuration.password) : null;
  const fallback = preferred || (!internal ? await readConnectedState(SYSTEM_STATE_KEY, configuration.password) : null);
  if (!fallback) return null;
  return refreshConnectedState(preferred ? preferredKey : SYSTEM_STATE_KEY, fallback.state, fallback.session, configuration);
};

const propertyIds = (session: UnoSession, filters: UnoReportFilters) => filters.property && filters.property !== "all"
  ? session.properties.filter((property) => property.name === filters.property).map((property) => property.id)
  : session.properties.map((property) => property.id);

const searchPayload = (session: UnoSession, filters: UnoReportFilters) => ({
  ChainID: session.chainId,
  propertyIds: propertyIds(session, filters),
  // Confirmed in the operational report includes Modified. Ask UNO for all statuses then
  // apply the canonical local filter so status 3 is never lost before reconciliation.
  BookingStatus: filters.status === "confirmed"
    ? 0
    : filters.status === "cancelled"
      ? -1
      : filters.status === "modified"
        ? 3
        : 0,
  Channel: "0",
  SourceType: "Voice",
  searchText: "",
  isExcelDownload: false,
  ...(filters.dateType === "booking" ? { bookingDateFrom: filters.from, bookingDateTo: filters.to } : {}),
  ...(filters.dateType === "checkin" ? { checkinDateFrom: filters.from, checkinDateTo: filters.to } : {}),
  ...(filters.dateType === "checkout" ? { checkoutDateFrom: filters.from, checkoutDateTo: filters.to } : {}),
});

const headers = (session: UnoSession) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Bearer ${session.token}`,
  UserID: "VOICE",
});

const reservationArrays = (payload: unknown, depth = 0): JsonRecord[][] => {
  if (depth > 5) return [];
  if (Array.isArray(payload)) {
    const records = payload.map(asRecord).filter((record) => Object.keys(record).length > 0);
    return records.length ? [records] : [];
  }
  const record = asRecord(payload);
  return Object.values(record).flatMap((value) => reservationArrays(value, depth + 1));
};

const recordsFromPayload = (payload: unknown) => {
  const record = asRecord(payload);
  const body = asRecord(record.body);
  if (Array.isArray(body.reservationsRecords)) return body.reservationsRecords.map(asRecord);
  return reservationArrays(payload).sort((left, right) => right.length - left.length)[0] || [];
};

const reportedTotalFromPayload = (payload: unknown) => {
  const record = asRecord(payload);
  const body = asRecord(record.body);
  for (const candidate of [body, record]) {
    for (const key of ["totalRecords", "totalRecord", "totalCount", "recordCount", "totalRows", "TotalRecords", "TotalCount"]) {
      const value = Number(candidate[key]);
      if (Number.isFinite(value) && value >= 0) return Math.trunc(value);
    }
  }
  return null;
};

const requestPage = async (
  configuration: ReturnType<typeof readConfiguration>,
  session: UnoSession,
  filters: UnoReportFilters,
  page: number,
  pageSize: number,
  serverPagination: boolean,
) => {
  const endpoint = new URL(VOICE_SEARCH_PATH, configuration.voiceApiBaseUrl);
  endpoint.search = new URLSearchParams({
    isforPageSize: serverPagination ? "true" : "false",
    page: String(page),
    pageSize: String(pageSize),
    isBookingDateUsed: String(filters.dateType === "booking"),
    ServerSidePagination: String(serverPagination),
  }).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify(searchPayload(session, filters)),
    signal: AbortSignal.timeout(28_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) throw new Error("UNO_SESSION_EXPIRED");
  if (!response.ok) throw new Error(`UNO_REPORT_${response.status}`);
  return {
    records: recordsFromPayload(payload),
    reportedTotal: reportedTotalFromPayload(payload),
  };
};

const rawReservationKey = (record: JsonRecord) => asString(
  record.reservationNo || record.ReservationNo || record.reservationNumber || record.ReservationNumber || record.pmsid || record.pmsId,
);

const pageFingerprint = (records: JsonRecord[]) => records.length
  ? [records.length, ...records.slice(0, 3).map(rawReservationKey), ...records.slice(-3).map(rawReservationKey)].join("|")
  : "empty";

const fetchFullReport = async (
  configuration: ReturnType<typeof readConfiguration>,
  session: UnoSession,
  filters: UnoReportFilters,
) => {
  const unbounded = await requestPage(configuration, session, filters, 1, -1, false);
  let chosen = unbounded.records;
  let fetchMode: FetchQuality["fetchMode"] = "unbounded";
  let pages = 1;
  let reportedTotal = unbounded.reportedTotal;

  // UNO has returned capped result sets in different builds. Any exact 1,000+ page-sized
  // response is validated with server pagination before the report is accepted.
  const suspiciousCap = unbounded.records.length >= PAGED_SIZE
    || (reportedTotal !== null && reportedTotal > unbounded.records.length);

  if (suspiciousCap) {
    const paged: JsonRecord[] = [];
    const fingerprints = new Set<string>();
    let pagedTotal = reportedTotal;
    let page = 1;

    while (page <= MAX_PAGES && paged.length < MAX_REPORT_ROWS) {
      const response = await requestPage(configuration, session, filters, page, PAGED_SIZE, true);
      const fingerprint = pageFingerprint(response.records);
      if (fingerprints.has(fingerprint)) break;
      fingerprints.add(fingerprint);
      if (!response.records.length) break;
      paged.push(...response.records);
      if (response.reportedTotal !== null) pagedTotal = response.reportedTotal;
      if (response.records.length < PAGED_SIZE) break;
      if (pagedTotal !== null && paged.length >= pagedTotal) break;
      page += 1;
    }

    if (paged.length > chosen.length) {
      chosen = paged;
      fetchMode = "paged";
      pages = fingerprints.size;
      reportedTotal = pagedTotal;
    }
  }

  if (chosen.length > MAX_REPORT_ROWS || (reportedTotal !== null && reportedTotal > MAX_REPORT_ROWS)) {
    throw new Error("UNO_REPORT_TOO_LARGE");
  }

  const normalized = chosen.map((record) => normalizeReservation(record) as UnoReservationRecord);
  const deduplicated = deduplicateUnoReservations(normalized);
  const filtered = filterUnoReservations(deduplicated.reservations, filters);

  return {
    reservations: filtered,
    quality: {
      fetchMode,
      pages,
      sourceRows: chosen.length,
      reportedTotal,
      duplicateReservations: deduplicated.duplicates,
      missingReservationNumber: deduplicated.missingReservationNumber,
      truncated: false as const,
    } satisfies FetchQuality,
  };
};

const toBookingRecord = (reservation: UnoReservationRecord): BookingRecord => {
  const group = unoStatusGroup(reservation.status);
  return {
    "Booking time": riyadhReportDate(reservation.bookingDate, true),
    "Guest Name": reservation.guestName,
    "Agent Name": reservation.agentName,
    "Resv. no.": reservation.unoNumber || reservation.pmsNumber,
    "Check-in": riyadhReportDate(reservation.checkIn),
    "Check-out": riyadhReportDate(reservation.checkOut),
    "Booking Status": group === "confirmed" ? "Confirmed" : group === "modified" ? "Modified" : group === "cancelled" ? "Cancelled" : reservation.status,
    Property: reservation.property,
    City: reservation.city,
    Channel: reservation.channel,
    Amount: reservation.amount,
    Currency: reservation.currency,
  };
};

const isCanonicalFilters = (filters: UnoReportFilters) => {
  const canonical = currentMonthUnoSyncFilters();
  return filters.dateType === canonical.dateType
    && filters.from === canonical.from
    && filters.to === canonical.to
    && filters.property === canonical.property
    && filters.status === canonical.status;
};

const publishProductivity = async (reservations: UnoReservationRecord[], filters: UnoReportFilters) => {
  const classified = reservations.filter((reservation) => unoStatusGroup(reservation.status) !== "other");
  if (!classified.length) return { published: false as const, error: "لا توجد حجوزات مصنفة في نطاق التقرير." };
  if (!classified.some((reservation) => reservation.agentName.trim())) {
    return { published: false as const, error: "أعاد UNO الحجوزات بدون Agent Name؛ تم الحفاظ على تقرير الموظفين السابق." };
  }
  try {
    const stats = await saveBookingRecords(
      reservations.map(toBookingRecord),
      `uno-reconciled-${filters.from}-${filters.to}.csv`,
    );
    return { published: true as const, stats };
  } catch (error) {
    return { published: false as const, error: error instanceof Error ? error.message : "تعذر حفظ تقرير الإنتاجية." };
  }
};

const updateSyncHealth = async (
  ok: boolean,
  filters: UnoReportFilters,
  options: { source: "automatic" | "manual"; total?: number; error?: string; requiresOtp?: boolean },
) => {
  const store = snapshotStore();
  const previous = await store.get(SYNC_HEALTH_KEY, { type: "json" }).catch(() => null) as JsonRecord | null;
  const now = new Date().toISOString();
  await store.setJSON(SYNC_HEALTH_KEY, ok ? {
    state: "healthy",
    lastAttemptAt: now,
    lastSuccessAt: now,
    lastSuccessSource: options.source,
    lastCount: options.total || 0,
    consecutiveFailures: 0,
    requiresOtp: false,
    reportFilters: filters,
  } : {
    ...(previous || {}),
    state: options.requiresOtp ? "verification_required" : "failed",
    lastAttemptAt: now,
    lastError: options.error || "UNO sync failed",
    consecutiveFailures: Number(previous?.consecutiveFailures || 0) + 1,
    requiresOtp: options.requiresOtp === true,
    reportFilters: filters,
  });
};

const executeReport = async (
  req: Request,
  filters: UnoReportFilters,
  source: "automatic" | "manual",
  internal: boolean,
) => {
  const configuration = readConfiguration();
  if (!configuration.password) return json({ error: "إعدادات UNO غير مكتملة." }, 503);
  const active = await activeSession(req, internal, configuration);
  if (!active) {
    await updateSyncHealth(false, filters, { source, error: "انتهت جلسة UNO وتحتاج OTP.", requiresOtp: true }).catch(() => undefined);
    return json({ error: "UNO verification required", requiresOtp: true, staleDataPreserved: true }, 409);
  }

  try {
    const fetched = await fetchFullReport(configuration, active.session, filters);
    const canonicalUpdated = isCanonicalFilters(filters);
    const summary = summarizeUnoReservations(fetched.reservations, fetched.quality);
    const productivity = canonicalUpdated
      ? await publishProductivity(fetched.reservations, filters)
      : { published: false as const, skipped: true as const };
    const syncedAt = new Date().toISOString();

    if (canonicalUpdated) {
      await snapshotStore().setJSON("latest", {
        reservations: fetched.reservations,
        total: fetched.reservations.length,
        syncedAt,
        source,
        sourceSystem: "UNO",
        sessionExpiresAt: new Date(active.state.expiresAt).toISOString(),
        reportFilters: filters,
        summary,
        quality: fetched.quality,
        productivity: productivity.published ? {
          published: true,
          updatedAt: productivity.stats.updatedAt,
          records: productivity.stats.classifiedTotal,
          employees: productivity.stats.employeeCount,
        } : {
          published: false,
          error: "skipped" in productivity ? undefined : productivity.error,
        },
      });
      await updateSyncHealth(true, filters, { source, total: fetched.reservations.length }).catch(() => undefined);
    }

    return json({
      reservations: fetched.reservations,
      total: fetched.reservations.length,
      searchedAt: syncedAt,
      syncedAt,
      reportReady: true,
      reportFilters: filters,
      canonicalUpdated,
      summary,
      quality: fetched.quality,
      productivityReady: productivity.published,
      productivityUpdatedAt: productivity.published ? productivity.stats.updatedAt : undefined,
      productivityRecords: productivity.published ? productivity.stats.classifiedTotal : undefined,
      productivityEmployees: productivity.published ? productivity.stats.employeeCount : undefined,
      reportError: productivity.published || "skipped" in productivity ? undefined : productivity.error,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const requiresOtp = code === "UNO_SESSION_EXPIRED";
    const message = code === "UNO_REPORT_TOO_LARGE"
      ? "تقرير UNO تجاوز 50,000 سجل. اختر فترة أقصر حتى لا يتم اعتماد تقرير ناقص."
      : requiresOtp
        ? "انتهت جلسة UNO وتحتاج إلى OTP جديد."
        : /^UNO_REPORT_\d+$/.test(code)
          ? `رفض UNO طلب التقرير (${code.replace("UNO_REPORT_", "")}).`
          : "تعذر جلب تقرير UNO الكامل. تم الحفاظ على آخر تقرير ناجح.";
    if (isCanonicalFilters(filters)) {
      await updateSyncHealth(false, filters, { source, error: message, requiresOtp }).catch(() => undefined);
    }
    return json({ error: message, staleDataPreserved: true, requiresOtp }, requiresOtp ? 409 : 502);
  }
};

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const configuration = readConfiguration();
  const internal = internalAuthorized(req, configuration.password);

  if (!internal) {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const session = await validateSession(req);
    if (!session) return json({ error: "Unauthorized" }, 401);
    if (!["superadmin", "admin"].includes(session.role)) return json({ error: "Permission Denied" }, 403);
  }

  const body = await req.json().catch(() => ({})) as { action?: string; filters?: unknown };
  const action = asString(body.action);
  if (internal && action !== "sync-system") return json({ error: "Permission Denied" }, 403);
  if (!internal && action !== "export") return json({ error: "Invalid action" }, 400);

  let filters: UnoReportFilters;
  try {
    filters = internal ? currentMonthUnoSyncFilters() : parseUnoReportFilters(body.filters) as UnoReportFilters;
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "فلاتر التقرير غير صحيحة." }, 400);
  }

  return executeReport(req, filters, internal ? "automatic" : "manual", internal);
};

export const config: Config = {
  path: "/api/admin/uno-report",
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};
