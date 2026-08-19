export type UnoReportStatus = "all" | "confirmed" | "cancelled" | "modified";

export type UnoReportFilters = {
  dateType: "booking" | "checkin" | "checkout";
  from: string;
  to: string;
  property: string;
  status: UnoReportStatus;
};

export type UnoReservationRecord = {
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

export type UnoReportSummary = {
  total: number;
  confirmed: number;
  modified: number;
  cancelled: number;
  other: number;
  duplicateReservations: number;
  missingReservationNumber: number;
  missingAgent: number;
  missingAmount: number;
  pmsLinked: number;
  pmsPending: number;
  pmsLinkRate: number;
  confirmedRevenueByCurrency: Record<string, number>;
  cancelledRevenueByCurrency: Record<string, number>;
};

const clean = (value: unknown) => String(value ?? "").trim();

export const normalizeReservationNumber = (value: string) => clean(value)
  .replace(/\.0+$/, "")
  .replace(/[\s-]+/g, "")
  .toLocaleLowerCase("en");

const normalizePhone = (value: string) => clean(value).replace(/\D/g, "");
const normalizeName = (value: string) => clean(value).replace(/\s+/g, " ").toLocaleLowerCase("en");

export const unoStatusGroup = (value: string): "confirmed" | "modified" | "cancelled" | "other" => {
  const normalized = clean(value).toLocaleLowerCase("en");
  if (normalized === "3" || /modif|معدل|معدّل/.test(normalized)) return "modified";
  if (["-1", "2", "c", "ns"].includes(normalized) || /cancel|no[\s-]?show|ملغ|عدم حضور/.test(normalized)) return "cancelled";
  if (["1", "m", "o", "n", "i"].includes(normalized) || /confirm|مؤكد/.test(normalized)) return "confirmed";
  return "other";
};

const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;

export const riyadhDateKey = (value: string) => {
  const raw = clean(value);
  const direct = raw.match(dateOnly);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const riyadhReportDate = (value: string, includeTime = false) => {
  const raw = clean(value);
  const direct = raw.match(dateOnly);
  if (direct) {
    const parsed = new Date(`${raw}T12:00:00+03:00`);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Riyadh",
      day: "numeric",
      month: "short",
      year: "2-digit",
    }).format(parsed).replace(/,/g, "");
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "short",
    year: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(parsed).replace(/,/g, "");
};

export const parseReservationAmount = (value: string) => {
  const raw = clean(value);
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw);
  const normalized = raw.replace(/[(),\s]/g, "").replace(/[^0-9.+-]/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return negative ? -Math.abs(number) : number;
};

export const canonicalReservationKey = (reservation: UnoReservationRecord) => {
  const uno = normalizeReservationNumber(reservation.unoNumber);
  if (uno) return `uno:${uno}`;
  const pms = normalizeReservationNumber(reservation.pmsNumber);
  if (pms) return `pms:${normalizeName(reservation.property)}:${pms}`;
  const phone = normalizePhone(reservation.phone);
  const guest = normalizeName(reservation.guestName);
  const property = normalizeName(reservation.property);
  const checkIn = riyadhDateKey(reservation.checkIn);
  const bookingDate = riyadhDateKey(reservation.bookingDate);
  return `fallback:${phone}|${guest}|${property}|${checkIn}|${bookingDate}`;
};

const mergeReservation = (previous: UnoReservationRecord, incoming: UnoReservationRecord): UnoReservationRecord => {
  const merged = { ...previous };
  (Object.keys(merged) as Array<keyof UnoReservationRecord>).forEach((key) => {
    const value = clean(incoming[key]);
    if (value) merged[key] = value;
  });
  return merged;
};

export const deduplicateUnoReservations = (reservations: UnoReservationRecord[]) => {
  const map = new Map<string, UnoReservationRecord>();
  let duplicates = 0;
  let missingReservationNumber = 0;

  for (const reservation of reservations) {
    if (!normalizeReservationNumber(reservation.unoNumber) && !normalizeReservationNumber(reservation.pmsNumber)) {
      missingReservationNumber += 1;
    }
    const key = canonicalReservationKey(reservation);
    const previous = map.get(key);
    if (previous) {
      duplicates += 1;
      map.set(key, mergeReservation(previous, reservation));
    } else {
      map.set(key, { ...reservation });
    }
  }

  return {
    reservations: [...map.values()],
    duplicates,
    missingReservationNumber,
  };
};

export const filterUnoReservations = (reservations: UnoReservationRecord[], filters: UnoReportFilters) => reservations.filter((reservation) => {
  if (filters.property !== "all" && reservation.property !== filters.property) return false;
  const group = unoStatusGroup(reservation.status);
  if (filters.status === "confirmed" && !["confirmed", "modified"].includes(group)) return false;
  if (filters.status === "modified" && group !== "modified") return false;
  if (filters.status === "cancelled" && group !== "cancelled") return false;
  const value = filters.dateType === "checkin"
    ? reservation.checkIn
    : filters.dateType === "checkout"
      ? reservation.checkOut
      : reservation.bookingDate;
  const date = riyadhDateKey(value);
  return Boolean(date && date >= filters.from && date <= filters.to);
});

const addCurrencyAmount = (target: Record<string, number>, currency: string, amount: number) => {
  const key = clean(currency).toUpperCase() || "UNKNOWN";
  target[key] = Number(((target[key] || 0) + amount).toFixed(2));
};

export const summarizeUnoReservations = (
  reservations: UnoReservationRecord[],
  metadata: { duplicateReservations?: number; missingReservationNumber?: number } = {},
): UnoReportSummary => {
  const summary: UnoReportSummary = {
    total: reservations.length,
    confirmed: 0,
    modified: 0,
    cancelled: 0,
    other: 0,
    duplicateReservations: metadata.duplicateReservations || 0,
    missingReservationNumber: metadata.missingReservationNumber || 0,
    missingAgent: 0,
    missingAmount: 0,
    pmsLinked: 0,
    pmsPending: 0,
    pmsLinkRate: 0,
    confirmedRevenueByCurrency: {},
    cancelledRevenueByCurrency: {},
  };

  for (const reservation of reservations) {
    const group = unoStatusGroup(reservation.status);
    if (group === "confirmed") summary.confirmed += 1;
    else if (group === "modified") summary.modified += 1;
    else if (group === "cancelled") summary.cancelled += 1;
    else summary.other += 1;

    if (!clean(reservation.agentName)) summary.missingAgent += 1;
    if (clean(reservation.pmsNumber)) summary.pmsLinked += 1;
    else summary.pmsPending += 1;
    const amount = parseReservationAmount(reservation.amount);
    if (amount === null) {
      summary.missingAmount += 1;
      continue;
    }
    if (group === "confirmed" || group === "modified") addCurrencyAmount(summary.confirmedRevenueByCurrency, reservation.currency, amount);
    if (group === "cancelled") addCurrencyAmount(summary.cancelledRevenueByCurrency, reservation.currency, amount);
  }

  // For operational reporting, modified reservations are still active/confirmed reservations.
  summary.confirmed += summary.modified;
  summary.pmsLinkRate = summary.total
    ? Number(((summary.pmsLinked / summary.total) * 100).toFixed(2))
    : 0;
  return summary;
};
