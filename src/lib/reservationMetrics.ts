export type ReservationRow = Record<string, string | number | undefined>;
export type ReservationStatus = "confirmed" | "cancelled" | "ignored";

export const normalizeField = (value: string) => value.normalize("NFKC").toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا")
  .replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]/gu, "");

// Exact normalized headers only: "Cancellation policy" is never a booking status.
export const reservationValue = (row: ReservationRow, fields: string[]) => {
  for (const field of fields) {
    const key = Object.keys(row).find((key) => normalizeField(key) === normalizeField(field));
    if (key && row[key] !== undefined && String(row[key]).trim()) return String(row[key]).trim();
  }
  return "";
};

export const classifyReservationStatus = (value: string): ReservationStatus => {
  const status = normalizeField(String(value || ""));
  if (["m", "o", "n", "i", "1", "3", "confirm", "confirmed", "modify", "modified", "مؤكد", "معدل"].map(normalizeField).includes(status)) return "confirmed";
  if (["c", "ns", "cancel", "canceled", "cancelled", "noshow", "ملغي", "ملغى", "إلغاء", "نوشو", "عدم الحضور"].map(normalizeField).includes(status)) return "cancelled";
  return "ignored";
};

export const reservationStatusValue = (row: ReservationRow) => {
  if (row.__reportConflict === "1") return "CONFLICT";
  return reservationValue(row, ["PMS Status", "Opera Status", "حالة الحجز في PMS", "حالة أوبرا", "حالة الحجز في أوبرا"])
    || reservationValue(row, ["St", "All stute", "Booking Status", "Status", "حالة الحجز", "الحالة"]);
};

export const reservationAgent = (row: ReservationRow) => reservationValue(row,
  ["Agent Name", "Agent", "Employee Name", "Employee", "User Name", "اسم الموظف", "الموظف", "اسم المندوب", "المندوب"])
  .replace(/\s+/g, " ").trim();

const normalizedId = (value: string) => value.trim().replace(/\.0+$/, "").replace(/\s+/g, "").toLowerCase();
const recordIdentity = (row: ReservationRow) => {
  const external = normalizedId(reservationValue(row, ["Resv No", "Reservation No", "Reservation Number", "Resv ID", "unoNumber", "رقم الحجز"]));
  const pms = normalizedId(reservationValue(row, ["PMS No", "PMS Number", "PMS Confirmation Number", "pmsNumber", "رقم الحجز في PMS"]));
  const property = normalizeField(reservationValue(row, ["Property Name", "Property", "Hotel", "Hotel Name", "الفرع", "الفندق"]));
  return { external, pms, property, key: external || pms ? JSON.stringify([property, external, pms]) : "" };
};
const modifiedTime = (row: ReservationRow) => {
  const raw = reservationValue(row, ["Last Modified", "Modified At", "Updated At", "آخر تعديل"]);
  // Do not guess missing years or locale-dependent dates.
  return /^\d{4}-\d{2}-\d{2}T/.test(raw) ? Date.parse(raw) : NaN;
};

export function deduplicateReservationRows<T extends ReservationRow>(rows: T[]) {
  const unique: T[] = []; const indexes = new Map<string, number>();
  let duplicates = 0; let missingIds = 0;
  for (const row of rows) {
    const { key } = recordIdentity(row);
    if (!key) { missingIds++; unique.push({ ...row }); continue; }
    const index = indexes.get(key);
    if (index === undefined) { indexes.set(key, unique.length); unique.push({ ...row }); continue; }
    duplicates++;
    const previous = unique[index];
    const oldTime = modifiedTime(previous), newTime = modifiedTime(row);
    if (Number.isFinite(oldTime) && Number.isFinite(newTime) && oldTime !== newTime) {
      if (newTime > oldTime) unique[index] = { ...row };
      continue;
    }
    const statusConflict = classifyReservationStatus(reservationStatusValue(previous)) !== classifyReservationStatus(reservationStatusValue(row));
    const agentConflict = normalizeField(reservationAgent(previous)) !== normalizeField(reservationAgent(row));
    if (statusConflict || agentConflict || previous.__reportConflict === "1" || row.__reportConflict === "1") {
      unique[index] = { ...previous, __reportConflict: "1" };
    }
  }
  // An external-only parent is not an extra room when its PMS children are present.
  const mappedParents = new Set(unique.map(recordIdentity).filter((item) => item.external && item.pms).map((item) => JSON.stringify([item.property, item.external])));
  const bookings = unique.filter((row) => {
    const item = recordIdentity(row);
    const parent = item.external && !item.pms && mappedParents.has(JSON.stringify([item.property, item.external]));
    if (parent) duplicates++;
    return !parent;
  });
  return { bookings, duplicates, missingIds, conflicts: bookings.filter((row) => row.__reportConflict === "1").length };
}
