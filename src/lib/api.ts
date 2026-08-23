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
  sourceFormat: "csv" | "uno-spreadsheetml" | "uno-live-api";
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
  summary?: UnoReportSummary;
  quality?: UnoReportQuality;
};

export type UnoReportSummary = {
  total: number;
  confirmedOnly: number;
  confirmed: number;
  modified: number;
  cancelled: number;
  other: number;
  duplicateReservations: number;
  missingReservationNumber: number;
};

export type UnoReportQuality = {
  sourceRows: number;
  reportedTotal?: number | null;
  duplicateReservations: number;
  missingReservationNumber: number;
  truncated: boolean;
};

export type UnoSnapshotQuery = {
  q?: string;
  field?: "all" | "phone" | "pms" | "uno" | "guest";
  property?: string;
  status?: "all" | "confirmed" | "cancelled" | "other";
  dateField?: "bookingÕ:÷⁄$z{-ÆÈ‹j◊ù(regions.saudi, batchSize) },
    kuwait: { numbers: regions.kuwait, batches: toBatches(regions.kuwait, batchSize) },
    eligible: seen.size,
    duplicateReservations,
    invalidReservations,
    excludedStatuses,
  };
};
