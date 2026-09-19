import { classifyReservationStatus, deduplicateReservationRows, reservationStatusValue, reservationAgent } from "../../../src/lib/reservationMetrics";
export type BookingRecord = Record<string, string | number | undefined>;

export type EmployeeReportSettings = {
  reportMonth?: string;
  reportYear?: string;
  hiddenEmployees?: string[];
  employeeDisplayNames?: Record<string, string>;
  employeeAdjustments?: Record<string, {
    confirmedAdjustment?: number;
    cancelledAdjustment?: number;
  }>;
};

export type PublicEmployeeReport = {
  id: string;
  name: string;
  confirmed: number;
  cancelled: number;
  total: number;
  confirmationRate: number;
  sourceConfirmed: number;
  sourceCancelled: number;
  confirmedAdjustment: number;
  cancelledAdjustment: number;
};

export type PublicBookingReport = {
  generatedAt: string;
  updatedAt: string | null;
  period: { month: string; year: string; label: string };
  summary: {
    uploadedRecords: number;
    duplicateRecords: number;
    conflictingRecords: number;
    missingReservationIds: number;
    displayedConfirmed: number;
    displayedCancelled: number;
    classifiedTotal: number;
    confirmed: number;
    cancelled: number;
    ignored: number;
    unattributed: number;
    employeeCount: number;
    confirmationRate: number;
    cancelRate: number;
  };
  employees: PublicEmployeeReport[];
};

export type BookingReportMetadata = {
  duplicateReservations?: number;
  sourceRows?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export const normalizeEmployeeId = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en");

const isSystemEmployee = (value: string) => {
  const normalized = normalizeEmployeeId(value).replace(/[\s_-]+/g, "");
  return normalized === "unovoice" || normalized === "systemuno";
};

const getEmployeeName = reservationAgent;
const getStatus = reservationStatusValue;
const classifyStatus = classifyReservationStatus;

const toFiniteInteger = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
};

const percentage = (part: number, total: number) =>
  total ? Number(((part / total) * 100).toFixed(1)) : 0;

export const buildPublicBookingReport = (
  bookings: BookingRecord[],
  settings: EmployeeReportSettings = {},
  updatedAt: string | null = null,
  metadata: BookingReportMetadata = {},
): PublicBookingReport => {
  const deduplicated = deduplicateReservationRows(bookings);
  const employeeMap = new Map<string, { sourceName: string; confirmed: number; cancelled: number }>();
  let confirmed = 0;
  let cancelled = 0;
  let ignored = 0;
  let unattributed = 0;

  for (const booking of deduplicated.bookings) {
    const status = classifyStatus(getStatus(booking));
    if (status === "ignored") {
      ignored += 1;
      continue;
    }

    if (status === "confirmed") confirmed += 1;
    else cancelled += 1;

    const sourceName = getEmployeeName(booking);
    if (!sourceName || isSystemEmployee(sourceName)) {
      unattributed += 1;
      continue;
    }
    const id = normalizeEmployeeId(sourceName);
    const current = employeeMap.get(id) || { sourceName, confirmed: 0, cancelled: 0 };
    if (status === "confirmed") current.confirmed += 1;
    else current.cancelled += 1;
    employeeMap.set(id, current);
  }

  const hidden = new Set((settings.hiddenEmployees || []).map(normalizeEmployeeId));
  const displayNames = settings.employeeDisplayNames || {};
  const adjustments = settings.employeeAdjustments || {};

  const employees = Array.from(employeeMap.entries())
    .filter(([id]) => !hidden.has(id))
    .map(([id, value]) => {
      const adjustment = adjustments[id] || {};
      const employeeConfirmed = Math.max(0, value.confirmed + toFiniteInteger(adjustment.confirmedAdjustment));
      const employeeCancelled = Math.max(0, value.cancelled + toFiniteInteger(adjustment.cancelledAdjustment));
      const total = employeeConfirmed + employeeCancelled;
      return {
        id,
        name: String(displayNames[id] || value.sourceName).trim() || value.sourceName,
        confirmed: employeeConfirmed,
        cancelled: employeeCancelled,
        total,
        sourceConfirmed: value.confirmed, sourceCancelled: value.cancelled,
        confirmedAdjustment: employeeConfirmed - value.confirmed, cancelledAdjustment: employeeCancelled - value.cancelled,
        confirmationRate: percentage(employeeConfirmed, total),
      };
    })
    .sort((a, b) => b.confirmed - a.confirmed || b.total - a.total || a.name.localeCompare(b.name, "ar"));

  const classifiedTotal = confirmed + cancelled;
  const month = String(settings.reportMonth || "").trim();
  const year = String(settings.reportYear || "").trim();
  const sourceFrom = String(metadata.dateFrom || "").trim();
  const sourceTo = String(metadata.dateTo || "").trim();
  const detectedPeriod = sourceFrom && sourceTo ? (sourceFrom === sourceTo ? sourceFrom : `${sourceFrom} — ${sourceTo}`) : "";
  const periodLabel = detectedPeriod || [month, year].filter(Boolean).join(" / ") || "جميع البيانات المتاحة";

  return {
    generatedAt: new Date().toISOString(),
    updatedAt,
    period: { month, year, label: periodLabel },
    summary: {
      uploadedRecords: Math.max(bookings.length, Number(metadata.sourceRows) || 0),
      duplicateRecords: Math.max(deduplicated.duplicates, Number(metadata.duplicateReservations) || 0),
      conflictingRecords: deduplicated.conflicts,
      missingReservationIds: deduplicated.missingIds,
      displayedConfirmed: employees.reduce((sum, row) => sum + row.confirmed, 0),
      displayedCancelled: employees.reduce((sum, row) => sum + row.cancelled, 0),
      classifiedTotal,
      confirmed,
      cancelled,
      ignored,
      unattributed,
      employeeCount: employees.length,
      confirmationRate: percentage(confirmed, classifiedTotal),
      cancelRate: percentage(cancelled, classifiedTotal),
    },
    employees,
  };
};

