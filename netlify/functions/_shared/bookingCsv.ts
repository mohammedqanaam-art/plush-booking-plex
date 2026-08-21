import { updateBookingPhoneArchive, type PhoneArchiveStatus } from "./bookingPhoneArchive";
import { getEnvironmentStore } from "./storage";

export type BookingRecord = Record<string, string>;
export type BookingSourceFormat = "csv" | "uno-spreadsheetml" | "uno-live-api";

export type BookingStats = {
  total: number;
  confirmed: number;
  cancelled: number;
  cancelRate: number;
  updatedAt: string;
};

export type BookingReportQuality = {
  sourceFormat: BookingSourceFormat;
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

export type BookingReportStats = BookingStats & BookingReportQuality;
export type BookingSaveResult = BookingReportStats & { archive?: PhoneArchiveStatus };
export type BookingSaveOptions = { updateCurrent?: boolean; archivePeriod?: { from: string; to: string } };
export type ParsedBookingReport = {
  bookings: BookingRecord[];
  sourceFormat: BookingSourceFormat;
  sourceFileName: string;
  sourceRows: number;
  duplicateReservations: number;
};

export class BookingCsvError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BookingCsvError";
    this.status = status;
  }
}

const MAX_REPORT_BYTES = 5 * 1024 * 1024;
const MAX_REPORT_ROWS = 50_000;
const SYSTEM_AGENT_IDS = new Set(["unovoice", "systemuno"]);

export const isUnoBookingSourceFormat = (value: unknown): value is Exclude<BookingSourceFormat, "csv"> => (
  value === "uno-spreadsheetml" || value === "uno-live-api"
);

const bookingSourceLabel = (format: BookingSourceFormat) => {
  if (format === "uno-live-api") return "UNO Voice API";
  if (format === "uno-spreadsheetml") return "UNO Excel XML (.xls)";
  return "CSV";
};

const normalizeKey = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s_/.-]+/g, "")
    .trim();

const normalizeAgentId = (value: string) => normalizeKey(value);

export const isSystemBookingAgent = (value: string) => SYSTEM_AGENT_IDS.has(normalizeAgentId(value));

const parseRow = (line: string): string[] => {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  fields.push(current.trim());
  return fields;
};

export const parseBookingCsv = (text: string): BookingRecord[] => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseRow(lines[0]).map((header) => header.replace(/^\uFEFF/, "").trim());
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    const record: BookingRecord = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });
    return record;
  });
};

const safeCodePoint = (code: string, radix: number) => {
  const number = Number.parseInt(code, radix);
  return Number.isInteger(number) && number >= 0 && number <= 0x10FFFF ? String.fromCodePoint(number) : "";
};

const decodeXmlText = (value: string) => value
  .replace(/<[^>]*>/g, " ")
  .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => safeCodePoint(code, 16))
  .replace(/&#(\d+);/g, (_match, code: string) => safeCodePoint(code, 10))
  .replace(/&quot;/gi, '"')
  .replace(/&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&amp;/gi, "&")
  .replace(/\s+/g, " ")
  .trim();

const spreadsheetRows = (text: string): string[][] => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new BookingCsvError("ملف Excel XML يحتوي تعريفات غير مسموح بها.", 400);
  }

  const rows: string[][] = [];
  const rowPattern = /<(?:[a-z][\w-]*:)?Row\b[^>]*>([\s\S]*?)<\/(?:[a-z][\w-]*:)?Row>/gi;
  for (const rowMatch of text.matchAll(rowPattern)) {
    const values: string[] = [];
    const cellPattern = /<(?:[a-z][\w-]*:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:[a-z][\w-]*:)?Cell>|<(?:[a-z][\w-]*:)?Cell\b([^>]*)\/>/gi;
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const attributes = cellMatch[1] || cellMatch[3] || "";
      const indexMatch = attributes.match(/(?:ss:)?Index\s*=\s*["'](\d+)["']/i);
      const oneBasedIndex = indexMatch ? Number.parseInt(indexMatch[1], 10) : values.length + 1;
      while (values.length < Math.max(0, oneBasedIndex - 1)) values.push("");
      const content = cellMatch[2] || "";
      const dataMatch = content.match(/<(?:[a-z][\w-]*:)?Data\b[^>]*>([\s\S]*?)<\/(?:[a-z][\w-]*:)?Data>/i);
      values.push(decodeXmlText(dataMatch?.[1] || ""));
    }
    if (values.some(Boolean)) rows.push(values);
    if (rows.length > MAX_REPORT_ROWS + 1) {
      throw new BookingCsvError("عدد سجلات الحجوزات يتجاوز 50,000 سجل.", 413);
    }
  }
  return rows;
};

export const parseUnoSpreadsheetXml = (text: string): BookingRecord[] => {
  if (!/<(?:[a-z][\w-]*:)?Workbook\b/i.test(text) || !/urn:schemas-microsoft-com:office:spreadsheet/i.test(text)) {
    throw new BookingCsvError("الملف ليس تقرير Excel XML صالحًا من UNO.", 400);
  }

  const rows = spreadsheetRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  const normalizedHeaders = new Set(headers.map(normalizeKey));
  const requiredHeaders = ["agentname", "resvno", "bookingstatus"];
  if (!requiredHeaders.every((header) => normalizedHeaders.has(header))) {
    throw new BookingCsvError("لم يتم التعرف على أعمدة تقرير UNO المطلوبة: Agent Name وResv. no. وBooking Status.", 400);
  }

  return rows.slice(1).map((values) => {
    const record: BookingRecord = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });
    return record;
  });
};

const getRecordValue = (record: BookingRecord, keys: string[]): string => {
  for (const key of keys) {
    if (record[key] && String(record[key]).trim()) return String(record[key]);
  }

  const normalizedTargets = keys.map(normalizeKey);
  for (const [rawKey, rawValue] of Object.entries(record)) {
    if (!String(rawValue).trim()) continue;
    const normalized = normalizeKey(rawKey);
    if (normalizedTargets.includes(normalized)) return String(rawValue);
    if (normalizedTargets.some((target) => (
      target.length >= 4
      && normalized.length >= 4
      && (normalized.includes(target) || target.includes(normalized))
    ))) {
      return String(rawValue);
    }
  }

  return "";
};

const bookingStatus = (record: BookingRecord) => getRecordValue(record, [
  "St",
  "All stute",
  "All Stute",
  "Status",
  "Booking Status",
  "BookingStatus",
  "حالة الحجز",
  "الحالة",
]);

const bookingAgent = (record: BookingRecord) => getRecordValue(record, [
  "Agent name",
  "Agent Name",
  "Agent",
  "Employee",
  "Employee Name",
  "User Name",
  "اسم الموظف",
  "الموظف",
]);

const reservationNumber = (record: BookingRecord) => getRecordValue(record, [
  "Resv. no.",
  "Resv no",
  "Reservation No",
  "Reservation Number",
  "Resv ID",
  "رقم الحجز",
]);

export const classifyImportedBookingStatus = (status: string): "confirmed" | "cancelled" | "ignored" => {
  const normalized = status.trim().toUpperCase();
  if (["1", "3", "M", "O", "N", "I"].includes(normalized)) return "confirmed";
  if (["C", "NS"].includes(normalized)) return "cancelled";
  if (/^CONFIRMED?$/i.test(status.trim()) || /^(MODIFIED|MODIFY)$/i.test(status.trim()) || /^(مؤكد|معدل|معدّل)$/i.test(status.trim())) return "confirmed";
  if (/CANCEL|NO[\s-]?SHOW|ملغي|ملغى|إلغاء|الغاء/i.test(status)) return "cancelled";
  return "ignored";
};

export const calculateBookingStats = (bookings: BookingRecord[]) => {
  let confirmed = 0;
  let cancelled = 0;

  for (const booking of bookings) {
    const category = classifyImportedBookingStatus(bookingStatus(booking));
    if (category === "confirmed") confirmed += 1;
    if (category === "cancelled") cancelled += 1;
  }

  const total = confirmed + cancelled;

  return {
    total,
    confirmed,
    cancelled,
    cancelRate: total ? Number(((cancelled / total) * 100).toFixed(1)) : 0,
  };
};

const safeSourceName = (value: string) => {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original header value when it is not URI encoded.
  }
  return decoded.split(/[\\/]/).pop()?.replace(/\p{Cc}/gu, "").slice(0, 160) || "report";
};

const looksLikeUnoSpreadsheetXml = (text: string) => (
  /<(?:[a-z][\w-]*:)?Workbook\b/i.test(text)
  && /urn:schemas-microsoft-com:office:spreadsheet/i.test(text)
);

const deduplicateUnoRecords = (bookings: BookingRecord[]) => {
  const seen = new Set<string>();
  const unique: BookingRecord[] = [];
  let duplicates = 0;
  for (const booking of bookings) {
    const reservation = reservationNumber(booking).trim().toLocaleLowerCase("en");
    if (reservation && seen.has(reservation)) {
      duplicates += 1;
      continue;
    }
    if (reservation) seen.add(reservation);
    unique.push(booking);
  }
  return { bookings: unique, duplicates };
};

export const parseBookingReportText = (text: string, fileName = "report.csv"): ParsedBookingReport => {
  if (!text.trim()) throw new BookingCsvError("ملف الحجوزات فارغ.", 400);
  if (new TextEncoder().encode(text).byteLength > MAX_REPORT_BYTES) {
    throw new BookingCsvError("حجم ملف الحجوزات يتجاوز 5 MB.", 413);
  }

  const sourceFileName = safeSourceName(fileName);
  if (looksLikeUnoSpreadsheetXml(text)) {
    const sourceBookings = parseUnoSpreadsheetXml(text);
    const deduplicated = deduplicateUnoRecords(sourceBookings);
    return {
      bookings: deduplicated.bookings,
      sourceFormat: "uno-spreadsheetml",
      sourceFileName,
      sourceRows: sourceBookings.length,
      duplicateReservations: deduplicated.duplicates,
    };
  }

  if (/^\s*<\?xml|^\s*<(?:[a-z][\w-]*:)?Workbook\b/i.test(text)) {
    throw new BookingCsvError("صيغة XML المرفوعة ليست تقرير UNO المدعوم.", 400);
  }

  const bookings = parseBookingCsv(text);
  return {
    bookings,
    sourceFormat: "csv",
    sourceFileName,
    sourceRows: bookings.length,
    duplicateReservations: 0,
  };
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const parseDatedValue = (value: string, fallbackYear?: number): Date | null => {
  const normalized = value.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined) return null;
  const rawYear = match[3] ? Number.parseInt(match[3], 10) : fallbackYear;
  if (!rawYear) return null;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(Date.UTC(year, month, Number.parseInt(match[1], 10), Number.parseInt(match[4] || "0", 10), Number.parseInt(match[5] || "0", 10)));
  return Number.isNaN(date.getTime()) ? null : date;
};

const reportDateRange = (bookings: BookingRecord[]) => {
  const dates: Date[] = [];
  for (const booking of bookings) {
    const checkIn = parseDatedValue(getRecordValue(booking, ["Check-in", "Check in", "Arrival", "Arrival Date", "تاريخ الوصول"]));
    const bookingDateValue = getRecordValue(booking, ["Booking time", "Booking Date", "Booked Date", "تاريخ الحجز"]);
    let bookingDate = parseDatedValue(bookingDateValue, checkIn?.getUTCFullYear());
    if (bookingDate && checkIn && bookingDate.getTime() > checkIn.getTime() + 120 * 24 * 60 * 60 * 1000) {
      bookingDate = new Date(Date.UTC(
        bookingDate.getUTCFullYear() - 1,
        bookingDate.getUTCMonth(),
        bookingDate.getUTCDate(),
        bookingDate.getUTCHours(),
        bookingDate.getUTCMinutes(),
      ));
    }
    if (bookingDate) dates.push(bookingDate);
  }
  if (!dates.length) return { dateFrom: null, dateTo: null };
  const timestamps = dates.map((date) => date.getTime());
  return {
    dateFrom: new Date(Math.min(...timestamps)).toISOString().slice(0, 10),
    dateTo: new Date(Math.max(...timestamps)).toISOString().slice(0, 10),
  };
};

export const inspectParsedBookingReport = (parsed: ParsedBookingReport): BookingReportStats => {
  if (!parsed.bookings.length) throw new BookingCsvError("لم يتم العثور على بيانات صالحة في ملف الحجوزات.", 400);
  if (parsed.bookings.length > MAX_REPORT_ROWS) {
    throw new BookingCsvError("عدد سجلات الحجوزات يتجاوز 50,000 سجل.", 413);
  }

  const basic = calculateBookingStats(parsed.bookings);
  const classifiedTotal = basic.confirmed + basic.cancelled;
  if (!classifiedTotal) {
    throw new BookingCsvError("لم يتم التعرف على حالات حجوزات مؤكدة أو ملغاة في الملف.", 400);
  }

  const employees = new Set<string>();
  const reservations = new Set<string>();
  const systemAccounts = new Map<string, number>();
  let attributedRecords = 0;
  let unattributedRecords = 0;

  for (const booking of parsed.bookings) {
    const reservation = reservationNumber(booking).trim();
    if (reservation) reservations.add(reservation.toLocaleLowerCase("en"));
    if (classifyImportedBookingStatus(bookingStatus(booking)) === "ignored") continue;
    const agent = bookingAgent(booking).replace(/\s+/g, " ").trim();
    if (!agent || isSystemBookingAgent(agent)) {
      unattributedRecords += 1;
      if (agent) systemAccounts.set(agent, (systemAccounts.get(agent) || 0) + 1);
      continue;
    }
    attributedRecords += 1;
    employees.add(normalizeAgentId(agent));
  }

  return {
    ...basic,
    updatedAt: new Date().toISOString(),
    sourceFormat: parsed.sourceFormat,
    sourceLabel: bookingSourceLabel(parsed.sourceFormat),
    sourceFileName: parsed.sourceFileName,
    sourceRows: parsed.sourceRows,
    classifiedTotal,
    ignored: parsed.bookings.length - classifiedTotal,
    attributedRecords,
    unattributedRecords,
    employeeCount: employees.size,
    uniqueReservations: reservations.size,
    duplicateReservations: parsed.duplicateReservations,
    ...reportDateRange(parsed.bookings),
    systemAccounts: Array.from(systemAccounts.entries())
      .map(([name, records]) => ({ name, records }))
      .sort((left, right) => right.records - left.records),
  };
};

export const inspectBookingReportText = (text: string, fileName = "report.csv") => {
  const parsed = parseBookingReportText(text, fileName);
  return { bookings: parsed.bookings, stats: inspectParsedBookingReport(parsed) };
};

const saveParsedBookingReport = async (parsed: ParsedBookingReport, options: BookingSaveOptions = {}): Promise<BookingSaveResult> => {
  const stats = inspectParsedBookingReport(parsed);
  const archive = options.archivePeriod
    ? await updateBookingPhoneArchive(parsed.bookings, options.archivePeriod.from, options.archivePeriod.to)
    : undefined;
  if (options.updateCurrent !== false) {
    const store = getEnvironmentStore("bookings", { consistency: "strong" });
    const writes = [
      store.setJSON("data", parsed.bookings),
      store.setJSON("stats", stats),
    ];
    // Keep a canonical UNO-only copy. Manual CSV/CRO imports may still be inspected,
    // but they can never replace the figures served by the public UNO report.
    if (isUnoBookingSourceFormat(parsed.sourceFormat)) {
      writes.push(
        store.setJSON("uno-data", parsed.bookings),
        store.setJSON("uno-stats", stats),
      );
    }
    await Promise.all(writes);
  }
  return { ...stats, ...(archive ? { archive } : {}) };
};

export const saveBookingRecords = async (
  bookings: BookingRecord[],
  fileName = "uno-live-api.csv",
  options: BookingSaveOptions = {},
): Promise<BookingSaveResult> => {
  const deduplicated = deduplicateUnoRecords(bookings);
  return saveParsedBookingReport({
    bookings: deduplicated.bookings,
    sourceFormat: "uno-live-api",
    sourceFileName: safeSourceName(fileName),
    sourceRows: bookings.length,
    duplicateReservations: deduplicated.duplicates,
  }, options);
};

export const saveBookingReportText = async (
  text: string,
  fileName = "report.csv",
  options: BookingSaveOptions = {},
): Promise<BookingSaveResult> => saveParsedBookingReport(parseBookingReportText(text, fileName), options);

export const saveBookingCsv = async (csvText: string, options: BookingSaveOptions = {}): Promise<BookingSaveResult> => {
  if (!csvText.trim()) throw new BookingCsvError("ملف الحجوزات فارغ.", 400);
  if (new TextEncoder().encode(csvText).byteLength > MAX_REPORT_BYTES) {
    throw new BookingCsvError("حجم ملف الحجوزات يتجاوز 5 MB.", 413);
  }
  const bookings = parseBookingCsv(csvText);
  return saveParsedBookingReport({
    bookings,
    sourceFormat: "csv",
    sourceFileName: "cro-export.csv",
    sourceRows: bookings.length,
    duplicateReservations: 0,
  }, options);
};
