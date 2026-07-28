import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getBearerToken, json, validateSession } from "./_shared/security";

const DEFAULT_UNO_LOGIN_URL = "https://unolive.rategain.com/";
const DEFAULT_UNO_API_BASE_URL = "https://uno-prod-ui-api-1087875874170.us-central1.run.app/api/";
const AUTH_PATH = "AuthenticateUser/ValidateUserDetails";
const SEARCH_PATHS = ["reservation/SearchReservations", "reservation/allreservaions"] as const;
const UNO_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_DELAY_MS = 40 * 1000;
const SEARCH_LIMIT = 200;

type JsonRecord = Record<string, unknown>;
type UnoPhase = "idle" | "otp" | "connected";
type UnoSearchField = "phone" | "pms" | "uno";

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
};

type ConnectedState = {
  phase: "connected";
  connectedAt: number;
  expiresAt: number;
  encrypted: EncryptedValue;
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
  property: string;
  status: string;
  checkIn: string;
  checkOut: string;
  bookingDate: string;
  channel: string;
  amount: string;
  currency: string;
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
      || url.hostname === "v29-1---uno-prod-ui-api-cpayzgdkqq-uc.a.run.app";
    return url.protocol === "https:" && (rateGainHost || approvedUnoApiHost);
  } catch {
    return false;
  }
};

const readConfiguration = () => {
  const configuredLoginUrl = trimmedEnv("UNO_LOGIN_URL");
  const configuredApiBaseUrl = trimmedEnv("UNO_API_BASE_URL");
  const loginUrl = isTrustedRateGainUrl(configuredLoginUrl)
    ? configuredLoginUrl
    : DEFAULT_UNO_LOGIN_URL;
  const apiBaseUrl = isTrustedRateGainUrl(configuredApiBaseUrl)
    ? configuredApiBaseUrl
    : DEFAULT_UNO_API_BASE_URL;
  const username = trimmedEnv("UNO_USERNAME");
  const password = rawEnv("UNO_PASSWORD");
  const companyId = Math.max(1, Math.trunc(asNumber(trimmedEnv("UNO_COMPANY_ID")) || 1));
  const appVersion = trimmedEnv("UNO_APP_VERSION") || "29.1";

  return {
    loginUrl,
    apiBaseUrl: apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`,
    username,
    password,
    companyId,
    appVersion,
    configured: Boolean(username && password),
  };
};

const stateKey = (req: Request) => {
  const token = getBearerToken(req);
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
});

const readActiveState = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
) => {
  const state = await getState(key);
  if (!state) return { state: null, phase: "idle" as const, session: null };
  if (state.expiresAt <= Date.now()) {
    await clearState(key);
    return { state: null, phase: "idle" as const, session: null };
  }
  if (state.phase === "otp") return { state, phase: "otp" as const, session: null };

  const session = decryptSession(state.encrypted, configuration.password);
  if (!session?.token || !session.userId || !session.sessionId) {
    await clearState(key);
    return { state: null, phase: "idle" as const, session: null };
  }
  return { state, phase: "connected" as const, session };
};

const safeIpAddress = (context: Context) => {
  const candidate = (context.ip || "").trim();
  return /^[a-f0-9:.]{3,64}$/i.test(candidate) ? candidate : "0.0.0.0";
};

const authError = (payload: JsonRecord, verifying: boolean) => {
  const body = asRecord(payload.body);
  const userDetails = asRecord(body.userDetails);
  if (userDetails.isLocked === true) return "حساب UNO مقفل مؤقتًا.";
  if (userDetails.isPassWordInvalid === true) return "بيانات دخول UNO غير صحيحة.";
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
  const properties = firstArray(userDetails, ["properties", "Properties"]);
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

const sessionFromAuth = (payload: JsonRecord, fallbackIp: string) => {
  const body = asRecord(payload.body);
  const userDetails = asRecord(body.userDetails);
  const token = firstValue(body, ["userToken", "token", "accessToken"]);
  if (!token || body.isValidUser === false) return null;
  const firstName = firstValue(userDetails, ["firstName", "FirstName"]);
  const lastName = firstValue(userDetails, ["lastName", "LastName"]);
  const accountName = [firstName, lastName].filter(Boolean).join(" ")
    || firstValue(userDetails, ["userName", "UserName", "emailID", "EmailID"]);

  const session: UnoSession = {
    token,
    userId: firstValue(userDetails, ["userID", "UserID", "userId"]),
    sessionId: firstValue(userDetails, ["userSessionId", "UserSessionID", "sessionId"]),
    ipAddress: firstValue(userDetails, ["ipAddress", "IPAddress"]) || fallbackIp,
    chainId: firstValue(userDetails, ["chainId", "ChainID"]) || "1",
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
) => {
  const connectedAt = Date.now();
  const expiresAt = tokenExpiry(session.token, body);
  const state: ConnectedState = {
    phase: "connected",
    connectedAt,
    expiresAt,
    encrypted: encryptSession(session, configuration.password),
  };
  await setState(key, state);
  return state;
};

const hasOtpChallenge = (payload: JsonRecord) => {
  const body = asRecord(payload.body);
  return payload.status === true
    && body.isValidUser !== false
    && !firstValue(body, ["userToken", "token", "accessToken"])
    && asString(payload.description).toUpperCase() === "OTP";
};

const connect = async (
  key: string,
  configuration: ReturnType<typeof readConfiguration>,
  context: Context,
) => {
  if (!configuration.configured) return json({ error: "إعدادات UNO غير مكتملة." }, 503);
  try {
    const ipAddress = safeIpAddress(context);
    const { response, payload } = await postUnoAuth(configuration, ipAddress, 0);
    const connected = sessionFromAuth(payload, ipAddress);
    if (response.ok && connected) {
      const state = await saveConnectedState(key, configuration, connected.session, connected.body);
      return json(publicStatus(configuration, "connected", state, connected.session));
    }
    if (response.ok && hasOtpChallenge(payload)) {
      const now = Date.now();
      const state: PendingState = {
        phase: "otp",
        pendingAt: now,
        expiresAt: now + OTP_TTL_MS,
        resendAt: now + OTP_RESEND_DELAY_MS,
        ipAddress,
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
      const state = await saveConnectedState(key, configuration, connected.session, connected.body);
      return json(publicStatus(configuration, "connected", state, connected.session));
    }
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
    property: firstValue(record, ["name", "propertyName", "PropertyName", "hotelName"]),
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
  field: UnoSearchField,
  query: string,
) => {
  const propertyId = session.properties.map((property) => property.id).join(",");
  const payload: JsonRecord = {
    chainID: session.chainId,
    ChainID: session.chainId,
    propertyId,
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
  return payload;
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
  field: UnoSearchField,
  query: string,
) => {
  const searchPayload = createReservationSearchPayload(session, field, query);
  let unauthorized = false;
  let lastStatus = 502;

  for (const path of SEARCH_PATHS) {
    const endpoint = new URL(path, configuration.apiBaseUrl);
    endpoint.search = new URLSearchParams({
      isforPageSize: "false",
      page: "1",
      pageSize: String(SEARCH_LIMIT),
      isBookingDateUsed: "false",
      ServerSidePagination: "false",
    }).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: unoHeaders(session, configuration),
      body: JSON.stringify(searchPayload),
      signal: AbortSignal.timeout(25_000),
    });
    lastStatus = response.status;
    if (response.status === 401 || response.status === 403) {
      unauthorized = true;
      break;
    }
    if (!response.ok) continue;

    const payload = await response.json().catch(() => ({}));
    const candidates = reservationArrays(payload)
      .sort((left, right) => right.length - left.length)[0] || [];
    const searchableRecords = field === "phone"
      ? await enrichPhoneReservations(configuration, session, candidates)
      : candidates.slice(0, SEARCH_LIMIT);
    const reservations = searchableRecords
      .map(normalizeReservation)
      .filter((reservation) => matchesSearch(reservation, field, query));
    return { reservations, unauthorized: false, status: response.status };
  }
  return { reservations: [], unauthorized, status: lastStatus };
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

  const active = await readActiveState(key, configuration);
  if (active.phase !== "connected" || !active.session) {
    return json({ error: "اتصل بـ UNO أولًا.", ...publicStatus(configuration, "idle") }, 409);
  }

  try {
    const result = await fetchReservations(configuration, active.session, searchField, searchQuery);
    if (result.unauthorized) {
      await clearState(key);
      return json({ error: "انتهت جلسة UNO.", ...publicStatus(configuration, "idle") }, 401);
    }
    if (result.status >= 500) return json({ error: "تعذر تحميل حجوزات UNO." }, 502);
    return json({
      reservations: result.reservations,
      total: result.reservations.length,
      searchedAt: new Date().toISOString(),
    });
  } catch {
    return json({ error: "تعذر تحميل حجوزات UNO." }, 502);
  }
};

export default async (req: Request, context: Context) => {
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (!["superadmin", "admin"].includes(session.role)) return json({ error: "Permission Denied" }, 403);

  const key = stateKey(req);
  if (!key) return json({ error: "Unauthorized" }, 401);
  const configuration = readConfiguration();

  if (req.method === "GET") {
    const active = await readActiveState(key, configuration);
    return json(publicStatus(configuration, active.phase, active.state, active.session));
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = asRecord(await req.json().catch(() => ({})));
  const action = asString(body.action);
  if (action === "connect") return connect(key, configuration, context);
  if (action === "verify") return verifyOtp(key, configuration, asString(body.otp));
  if (action === "resend") return resendOtp(key, configuration);
  if (action === "disconnect") {
    await clearState(key);
    return json(publicStatus(configuration, "idle"));
  }
  if (action === "search") {
    return searchReservations(key, configuration, body.field, body.query);
  }
  return json({ error: "الإجراء غير صحيح." }, 400);
};

export const config: Config = {
  path: "/api/admin/uno",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
  },
};
