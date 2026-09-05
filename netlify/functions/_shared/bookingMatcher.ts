import type { UnoReservationRecord } from "./unoReportCore";

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const normalizeDigits = (value: string) => value.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));
const comparable = (value: unknown) => normalizeDigits(String(value || ""))
  .normalize("NFKD")
  .replace(/[\u064B-\u065F]/g, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();
const digitsOnly = (value: unknown) => normalizeDigits(String(value || "")).replace(/\D/g, "");
const isCalendarYear = (value: string) => {
  const year = Number(value);
  return value.length === 4 && year >= 1900 && year <= 2100;
};

export const matchBookingCandidates = (reservations: UnoReservationRecord[], message: string) => {
  const query = comparable(message);
  const numericIdentifiers = (query.match(/\d{4,}/g) || []).filter((value) => !isCalendarYear(value));
  const identifierTokens = query.split(" ").filter((value) => value.length >= 4 && /\d/.test(value) && !isCalendarYear(value));
  const rawDates = normalizeDigits(message).match(/(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})/g) || [];
  const dateTerms = rawDates.map(digitsOnly);
  const words = query.split(" ").filter((word) => word.length >= 3 && !/^\d+$/.test(word));
  if (!identifierTokens.length && (!dateTerms.length || words.length < 2)) {
    return { searchStatus: "more_specific_query_required" as const, candidates: [] };
  }

  const scored = reservations.map((reservation) => {
    const uno = comparable(reservation.unoNumber);
    const pms = comparable(reservation.pmsNumber);
    const phone = digitsOnly(reservation.phone);
    const name = comparable(reservation.guestName);
    const location = comparable(`${reservation.property || ""} ${reservation.city || ""}`);
    const reservationDates = [reservation.checkIn, reservation.checkOut, reservation.bookingDate].map(digitsOnly);
    const nameMatches = words.filter((word) => name.includes(word)).length;
    const locationMatches = words.filter((word) => location.includes(word)).length;
    const dateMatch = dateTerms.some((date) => reservationDates.includes(date));
    let score = 0;
    if (identifierTokens.some((identifier) => uno === identifier || pms === identifier)) score += 100;
    if (numericIdentifiers.some((number) => number.length >= 7 && phone.endsWith(number.slice(-8)))) score += 85;
    if (nameMatches >= 2 && dateMatch) score += 90;
    if (score > 0) score += Math.min(15, locationMatches * 5);
    return { reservation, score };
  }).filter(({ score }) => score >= 85).sort((left, right) => right.score - left.score).slice(0, 5);

  return {
    searchStatus: scored.length ? "candidates_found" as const : "no_candidates" as const,
    candidates: scored.map(({ reservation, score }) => ({
      score,
      unoNumber: String(reservation.unoNumber || "").slice(0, 80),
      pmsNumber: String(reservation.pmsNumber || "").slice(0, 80),
      phoneLast4: digitsOnly(reservation.phone).slice(-4),
      guestName: String(reservation.guestName || "").slice(0, 120),
      agentName: String(reservation.agentName || "").slice(0, 120),
      property: String(reservation.property || "").slice(0, 120),
      city: String(reservation.city || "").slice(0, 80),
      status: String(reservation.status || "").slice(0, 80),
      checkIn: String(reservation.checkIn || "").slice(0, 40),
      checkOut: String(reservation.checkOut || "").slice(0, 40),
      bookingDate: String(reservation.bookingDate || "").slice(0, 40),
    })),
  };
};
