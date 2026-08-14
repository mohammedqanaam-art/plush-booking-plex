import type { AvayaFileKind, AvayaReportResult } from "@/lib/avayaReportProcessor";

export type EmployeeAdjustment = {
  confirmedAdjustment?: number;
  cancelledAdjustment?: number;
  adjustmentReason?: string;
  notes?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export type AppSettings = {
  siteTitle?: string;
  bannerText?: string;
  reportMonth?: string;
  reportYear?: string;
  hiddenEmployees?: string[];
  employeeDisplayNames?: Record<string, string>;
  complaintEmail?: string;
  complaintEmailWebhook?: string;
  complaintWhatsappNumber?: string;
  themePreset?: string;
  employeeAdjustments?: Record<string, EmployeeAdjustment>;
};

export type PublicBookingReport = {
  generatedAt: string;
  updatedAt: string | null;
  period: { month: string; year: string; label: string };
  summary: {
    uploadedRecords: number;
    classifiedTotal: number;
    confirmed: number;
    cancelled: number;
    ignored: number;
    unattributed: number;
    employeeCount: number;
    confirmationRate: number;
    cancelRate: number;
  };
  employees: Array<{
    id: string;
    name: string;
    confirmed: number;
    cancelled: number;
    total: number;
    confirmationRate: number;
  }>;
};

export type BookingReportStats = {
  total: number;
  confirmed: number;
  cancelled: number;
  cancelRate: number;
  updatedAt: string;
  sourceFormat: "csv" | "uno-spreadsheetml";
  sourceLabel: string;
  sourceFileName: string;
  sourceRows: number;
  classifiedTotal: number;
  ignored: number;
  attributedRecords: number;
  unattributedRecords: number;
  employeeCount: number;
  uniqueReservations: number;
  duplicateReservations: number;
  dateFrom: string | null;
  dateTo: string | null;
  systemAccounts: Array<{ name: string; records: number }>;
};

export type BookingUploadResponse = {
  ok: boolean;
  preview: boolean;
  stats: BookingReportStats;
};

export type UnoReportFilters = {
  dateType: "booking" | "checkin" | "checkout";
  from: string;
  to: string;
  property: string;
  status: "all" | "confirmed" | "cancelled" | "modified";
};

export type UnoConnectionStatus = {
  configured: boolean;
  loginUrl: string;
  phase: "idle" | "otp" | "connected";
  connected: boolean;
  automaticSyncConfigured: boolean;
  automaticSyncEnabled: boolean;
  automaticSyncHealthy?: boolean;
  automaticSyncState?: "disabled" | "running" | "healthy" | "verification_required" | "failed";
  lastSyncAttemptAt?: string;
  lastSyncSuccessAt?: string;
  lastSyncSuccessSource?: "automatic" | "manual";
  syncConsecutiveFailures?: number;
  syncRequiresOtp?: boolean;
  syncError?: string;
  syncReportFilters?: UnoReportFilters;
  pendingUntil?: string;
  resendAt?: string;
  expiresAt?: string;
  verifiedAt?: string;
  accountName?: string;
  propertyCount?: number;
  reportFilters?: UnoReportFilters;
  reportReady?: boolean;
  reportError?: string;
  lastExportAt?: string;
  lastExportCount?: number;
  lastExportSource?: "automatic" | "manual";
  productivityReady?: boolean;
  productivityUpdatedAt?: string;
  productivityRecords?: number;
  productivityEmployees?: number;
};

export type UnoSearchField = "phone" | "pms" | "uno";

export type UnoReservation = {
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

export type UnoSearchResponse = {
  reservations: UnoReservation[];
  total: number;
  searchedAt: string;
  syncedAt?: string;
  reportReady?: boolean;
  reportFilters?: UnoReportFilters;
  reportError?: string;
  productivityReady?: boolean;
  productivityUpdatedAt?: string;
  productivityRecords?: number;
  productivityEmployees?: number;
  canonicalUpdated?: boolean;
};

export type UnoSnapshotQuery = {
  q?: string;
  field?: "all" | "phone" | "pms" | "uno" | "guest";
  property?: string;
  status?: "all" | "confirmed" | "cancelled" | "other";
  dateField?: "booking" | "checkin" | "checkout";
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type UnoSnapshotResponse = {
  reservations: UnoReservation[];
  total: number;
  offset: number;
  limit: number;
  syncedAt: string | null;
  source: "automatic" | "manual" | null;
  sessionExpiresAt: string | null;
  properties: string[];
  summary: {
    total: number;
    confirmed: number;
    cancelled: number;
    other: number;
  };
};

export type AiMaintenanceFocus = "uno" | "security" | "ui" | "errors" | "custom";

export type AiMaintenanceReview = {
  id: string;
  focus: AiMaintenanceFocus;
  request: string;
  report: string;
  model: string;
  createdAt: string;
  requestedBy: string;
  source: "manual" | "daily";
  executionMode: "review_required";
};

export type AiMaintenanceStatus = {
  configured: boolean;
  executionMode: "review_required";
  latest: AiMaintenanceReview | null;
  history: AiMaintenanceReview[];
};

export type ContactRequest = {
  id: string;
  requestNo: string;
  brand: string;
  branchName: string;
  guestName: string;
  guestPhone: string;
  reason: string;
  status: "new" | "done";
  createdAt: string;
};

export type DiscountItem = {
  id: string;
  brand: "Boudl" | "Braira" | "Narcissus" | "Aber";
  title: string;
  percentage: number;
  active: boolean;
  startsAt?: string;
  endsAt?: string;
  notes?: string;
  createdAt: string;
};

export type ComplaintStatus = "open" | "under_review" | "closed";

export type ComplaintRecord = {
  complaintNo: string;
  brand: string;
  branch: string;
  mainCategory: string;
  subCategory: string;
  priority: string;
  guestName: string;
  bookingMobile: string;
  contactMobile: string;
  suiteNumber: string;
  checkInDate: string;
  notes: string;
  status: ComplaintStatus;
  createdAt: string;
};

export type AnalyticsSummary = {
  rangeDays: number;
  generatedAt: string;
  totalViews: number;
  uniqueVisitors: number;
  sessions: number;
  onlineCount: number;
  todayViews: number;
  todayVisitors: number;
  devices: Record<string, number>;
  browsers: Record<string, number>;
  operatingSystems: Record<string, number>;
  pages: Record<string, number>;
  referrers: Record<string, number>;
  trend: Array<{ date: string; views: number; visitors: number }>;
  online: Array<{
    visitorId: string;
    device: string;
    browser: string;
    os: string;
    country: string;
    city: string;
    path: string;
    lastSeen: string;
    ipMasked?: string;
    browserVersion?: string;
    osVersion?: string;
    region?: string;
    language?: string;
    screen?: string;
    timezone?: string;
    connection?: string;
  }>;
};

export type GhostVisitor = {
  visitorId: string;
  views: number;
  sessionCount: number;
  pages: Record<string, number>;
  device: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  ipMasked: string;
  country: string;
  city: string;
  region: string;
  geoTimezone: string;
  referrer: string;
  firstSeen: string;
  lastSeen: string;
  language?: string;
  languages?: string[];
  screen?: string;
  viewport?: string;
  timezone?: string;
  platform?: string;
  connection?: string;
  downlink?: number;
  saveData?: boolean;
  memory?: number;
  cpuCores?: number;
  touchPoints?: number;
  isPwa?: boolean;
};

export type GhostAnalyticsSummary = AnalyticsSummary & {
  recentVisitors: GhostVisitor[];
  privacy: { ipMode: "masked"; preciseLocation: false; fingerprinting: false };
};

export type BookingPhoneArchiveStatus = {
  configured: boolean;
  searchAvailable: boolean;
  periodCount: number;
  indexedReservations: number;
  indexedMobiles: number;
  earliestFrom: string | null;
  latestTo: string | null;
  updatedAt: string | null;
  latestPeriodPhoneColumnCount: number;
};

export type OperaSearchStatus = {
  source: "cro-archive";
  linkedSystem: "OPERA";
  readOnly: true;
  archive: BookingPhoneArchiveStatus;
};

export type OperaReservationSummary = {
  confirmationNumber: string;
  reservationId: string;
  guestName: string;
  status: string;
  bookedDate: string;
  arrivalDate: string;
  departureDate: string;
  hotelId: string;
  hotelName: string;
  roomType: string;
  roomNumber: string;
  numberOfRooms: number | null;
  archivedFrom: string;
  archivedTo: string;
};

export type OperaSearchRequest = {
  mobile: string;
};

export type OperaSearchResponse = {
  source: "cro-archive";
  linkedSystem: "OPERA";
  reservations: OperaReservationSummary[];
  totalResults: number;
  requestId: string;
  searchedAt: string;
  readOnly: true;
  archive: BookingPhoneArchiveStatus;
};

export type SyncedAvayaReport = AvayaReportResult & {
  reportId: string;
  syncedAt: string;
  sources: Array<{
    kind: AvayaFileKind;
    fileName: string;
    sha256: string;
    size: number;
    uploadedAt: string;
  }>;
};

export type AvayaSyncStatus = {
  report: SyncedAvayaReport | null;
  availableRanges: Array<{
    reportId: string;
    from: string;
    to: string;
    rangeStart: string;
    rangeEnd: string;
    syncedAt: string;
    employeeCount: number;
  }>;
  selectedRange: { from: string; to: string } | null;
  sync: {
    configured: boolean;
    updatedAt: string | null;
    bridgeLastSeenAt?: string | null;
    bridgeVersion?: string | null;
    bridgeHealthy?: boolean;
  };
};

const API_BASE = "/.netlify/functions";
const OPERA_SEARCH_API = "/api/admin/opera-search";
const AVAYA_SYNC_API = "/api/avaya/sync";
const PUBLIC_REPORT_MEMORY_TTL_MS = 30_000;

let publicReportMemory: { report: PublicBookingReport; expiresAt: number } | null = null;
let publicReportRequest: Promise<PublicBookingReport> | null = null;

const clearPublicReportMemory = () => {
  publicReportMemory = null;
  publicReportRequest = null;
};

const fetchPublicBookingReport = async (fresh = false): Promise<PublicBookingReport> => {
  if (!fresh && publicReportMemory && publicReportMemory.expiresAt > Date.now()) {
    return publicReportMemory.report;
  }
  if (!fresh && publicReportRequest) return publicReportRequest;

  const request = (async () => {
    const suffix = fresh ? "&fresh=1" : "";
    const res = await fetch(`${API_BASE}/bookings?view=summary${suffix}`, fresh ? { cache: "no-store" } : undefined);
    if (!res.ok) throw new Error("تعذر تحميل التقرير");
    const report = await res.json() as PublicBookingReport;
    publicReportMemory = { report, expiresAt: Date.now() + PUBLIC_REPORT_MEMORY_TTL_MS };
    return report;
  })();

  if (fresh) return request;
  publicReportRequest = request;
  try {
    return await request;
  } finally {
    publicReportRequest = null;
  }
};

const authHeaders = (): Record<string, string> => ({});

const unoAction = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const res = await fetch("/api/admin/uno", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "تعذر تنفيذ طلب UNO");
  return data;
};

export const api = {
  async login(username: string, password: string) {
    const res = await fetch(`${API_BASE}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "فشل تسجيل الدخول");
    const data = await res.json();
    sessionStorage.setItem("admin_session", JSON.stringify({ username: data.username, role: data.role }));
    return data;
  },

  async validateSession() {
    const res = await fetch(`${API_BASE}/auth`, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
  },

  async logout() {
    await fetch(`${API_BASE}/auth`, { method: "DELETE", headers: authHeaders() }).catch(() => null);
    sessionStorage.removeItem("admin_session");
  },

  async getUsers() {
    const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() });
    if (!res.ok) throw new Error("تعذر تحميل المستخدمين");
    return res.json();
  },

  async createUser(username: string, password: string, role: string) {
    const res = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ username, password, role }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "تعذر إنشاء المستخدم");
    return res.json();
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const res = await fetch(`${API_BASE}/users`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "تعذر تغيير كلمة المرور");
    return res.json();
  },

  async deleteUser(username: string) {
    const res = await fetch(`${API_BASE}/users`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) throw new Error("تعذر حذف المستخدم");
    return res.json();
  },

  async getAnalytics(days: 7 | 30 | 90 = 30) {
    const res = await fetch(`${API_BASE}/analytics?days=${days}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("تعذر تحميل إحصائيات الموقع");
    return res.json() as Promise<AnalyticsSummary>;
  },

  async getGhostAnalytics(days: 7 | 30 | 90 = 30) {
    const res = await fetch(`${API_BASE}/analytics?days=${days}&detail=ghost`, { headers: authHeaders() });
    if (!res.ok) throw new Error("تعذر تحميل سجل الزوار المحمي");
    return res.json() as Promise<GhostAnalyticsSummary>;
  },

  async getOperaSearchStatus() {
    const res = await fetch(OPERA_SEARCH_API, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "تعذر تحميل حالة أرشيف الحجوزات");
    return data as OperaSearchStatus;
  },

  async getLatestAvayaReport(range?: { from: string; to: string }) {
    const params = range ? new URLSearchParams(range).toString() : "";
    const res = await fetch(`${AVAYA_SYNC_API}${params ? `?${params}` : ""}`, { headers: authHeaders(), cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "تعذر تحميل آخر مزامنة من Avaya");
    return data as AvayaSyncStatus;
  },

  async searchOperaReservations(payload: OperaSearchRequest) {
    const res = await fetch(OPERA_SEARCH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "تعذر البحث في الحجوزات");
    return data as OperaSearchResponse;
  },

  async uploadBookings(csvText: string) {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "text/csv", ...authHeaders() },
      body: csvText,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "فشل رفع الملف");
    const data = await res.json();
    clearPublicReportMemory();
    return data;
  },

  async inspectBookingReport(file: File) {
    const res = await fetch(`${API_BASE}/bookings?preview=1`, {
      method: "POST",
      headers: {
        "Content-Type": file.name.toLocaleLowerCase("en").endsWith(".csv") ? "text/csv; charset=utf-8" : "application/xml; charset=utf-8",
        "X-Report-Filename": encodeURIComponent(file.name),
        ...authHeaders(),
      },
      body: await file.text(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "تعذر فحص تقرير الحجوزات");
    return data as BookingUploadResponse;
  },

  async uploadBookingReport(file: File) {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": file.name.toLocaleLowerCase("en").endsWith(".csv") ? "text/csv; charset=utf-8" : "application/xml; charset=utf-8",
        "X-Report-Filename": encodeURIComponent(file.name),
        ...authHeaders(),
      },
      body: await file.text(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "فشل رفع تقرير الحجوزات");
    clearPublicReportMemory();
    return data as BookingUploadResponse;
  },

  async resetBookings() {
    const res = await fetch(`${API_BASE}/bookings`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) throw new Error("تعذر تصفير البيانات");
    const data = await res.json();
    clearPublicReportMemory();
    return data;
  },

  async getBookings() {
    const res = await fetch(`${API_BASE}/bookings`, { headers: authHeaders() });
    if (!res.ok) throw new Error("تعذر تحميل البيانات");
    return res.json();
  },

  async getPublicBookingReport(options: { fresh?: boolean } = {}) {
    return fetchPublicBookingReport(Boolean(options.fresh));
  },

  async getUnoConnection() {
    const res = await fetch("/api/admin/uno", { headers: authHeaders() });
    const data = await res.json().catch(() => ({})) as UnoConnectionStatus & { error?: string };
    if (!res.ok) throw new Error(data.error || "تعذر تحميل حالة UNO");
    return data;
  },

  async connectUno(filters?: UnoReportFilters) {
    return unoAction<UnoConnectionStatus>({ action: "connect", ...(filters ? { filters } : {}) });
  },

  async verifyUno(otp: string) {
    return unoAction<UnoConnectionStatus>({ action: "verify", otp });
  },

  async resendUnoOtp() {
    return unoAction<UnoConnectionStatus>({ action: "resend" });
  },

  async disconnectUno() {
    return unoAction<UnoConnectionStatus>({ action: "disconnect" });
  },

  async searchUnoReservations(field: UnoSearchField, query: string) {
    return unoAction<UnoSearchResponse>({ action: "search", field, query });
  },

  async listUnoReservations() {
    return unoAction<UnoSearchResponse>({ action: "list" });
  },

  async exportUnoReport(filters?: UnoReportFilters) {
    return unoAction<UnoSearchResponse>({ action: "export", ...(filters ? { filters } : {}) });
  },

  async getUnoSnapshot(query: UnoSnapshotQuery = {}) {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.field) params.set("field", query.field);
    if (query.property) params.set("property", query.property);
    if (query.status) params.set("status", query.status);
    if (query.dateField) params.set("dateField", query.dateField);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.limit) params.set("limit", String(query.limit));
    if (typeof query.offset === "number") params.set("offset", String(query.offset));

    const suffix = params.toString();
    const res = await fetch(`/api/admin/uno-reservations${suffix ? `?${suffix}` : ""}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({})) as UnoSnapshotResponse & { error?: string };
    if (!res.ok) throw new Error(data.error || "تعذر تحميل سجل UNO المتزامن");
    return data;
  },

  async createContactRequest(payload: { brand: string; branchName: string; guestName: string; guestPhone: string; reason: string }) {
    const res = await fetch(`${API_BASE}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("تعذر إرسال الطلب");
    return res.json() as Promise<{ request: ContactRequest }>;
  },

  async getContactRequests() {
    const res = await fetch(`${API_BASE}/contacts`, { headers: authHeaders() });
    if (!res.ok) throw new Error("تعذر تحميل الطلبات");
    return res.json() as Promise<{ requests: ContactRequest[] }>;
  },

  async updateContactRequestStatus(id: string, status: "new" | "done") {
    const res = await fetch(`${API_BASE}/contacts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) throw new Error("تعذر تحديث الحالة");
    return res.json();
  },

  async getSettings(): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`, { headers: authHeaders() }).catch(() => null);
    if (!res || !res.ok) return { siteTitle: "Res", bannerText: "" };
    return res.json();
  },

  async updateSettings(settings: AppSettings) {
    const res = await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error("تعذر حفظ الإعدادات");
    const data = await res.json();
    clearPublicReportMemory();
    return data;
  },

  async submitComplaint(payload: Record<string, unknown>) {
    const res = await fetch(`${API_BASE}/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("تعذر إرسال الشكوى");
    return res.json();
  },

  async listComplaints() {
    const res = await fetch(`${API_BASE}/complaints`, { headers: authHeaders() });
    if (!res.ok) throw new Error("تعذر تحميل الشكاوى");
    return res.json() as Promise<{ complaints: ComplaintRecord[] }>;
  },

  async updateComplaint(payload: { complaintNo: string; status: ComplaintStatus }) {
    const res = await fetch(`${API_BASE}/complaints`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("تعذر تحديث الشكوى");
    return res.json();
  },

  async listDiscounts() {
    const res = await fetch(`${API_BASE}/discounts`);
    if (!res.ok) throw new Error("تعذر تحميل الخصومات");
    return res.json() as Promise<{ discounts: DiscountItem[] }>;
  },

  async createDiscount(payload: Partial<DiscountItem>) {
    const res = await fetch(`${API_BASE}/discounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("تعذر إنشاء الخصم");
    return res.json();
  },

  async updateDiscount(payload: Partial<DiscountItem> & { id: string }) {
    const res = await fetch(`${API_BASE}/discounts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("تعذر تحديث الخصم");
    return res.json();
  },

  async deleteDiscount(id: string) {
    const res = await fetch(`${API_BASE}/discounts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("تعذر حذف الخصم");
    return res.json();
  },

  async sendChatMessage(
    message: string,
    sessionId?: string,
    history?: Array<{ role: string; content: string }>,
  ): Promise<{ reply: string; sessionId?: string; model?: string; provider?: string }> {
    const res = await fetch(`${API_BASE}/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ message, sessionId, history }),
    });
    const data = await res.json().catch(() => ({})) as {
      reply?: string;
      sessionId?: string;
      model?: string;
      provider?: string;
      error?: unknown;
    };
    if (!res.ok) {
      const serverMessage = typeof data.error === "string" && /[\u0600-\u06ff]/.test(data.error)
        ? data.error.trim().slice(0, 240)
        : "تعذر الوصول إلى المساعد الذكي الآن.";
      throw new Error(serverMessage);
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("لم يُرجع المساعد ردًا صالحًا.");
    }
    return { ...data, reply: data.reply.trim() };
  },

  async getAiMaintenance() {
    const res = await fetch(`${API_BASE}/ai-maintenance`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error("تعذر تحميل الفحص الذكي");
    return res.json() as Promise<AiMaintenanceStatus>;
  },

  async runAiMaintenance(focus: AiMaintenanceFocus, request: string) {
    const res = await fetch(`${API_BASE}/ai-maintenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ focus, request }),
    });
    const data = await res.json().catch(() => ({})) as { review?: AiMaintenanceReview; error?: string };
    if (!res.ok || !data.review) throw new Error(data.error || "تعذر تنفيذ الفحص الذكي");
    return data.review;
  },
};
