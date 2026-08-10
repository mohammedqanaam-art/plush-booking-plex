import type { UnoReservation } from "@/lib/api";

export type OperaRegion = "saudi" | "kuwait";

export type OperaBatch = {
  batch: number;
  count: number;
  value: string;
};

export type OperaExportResult = {
  saudi: { numbers: string[]; batches: OperaBatch[] };
  kuwait: { numbers: string[]; batches: OperaBatch[] };
  eligible: number;
  duplicateReservations: number;
  invalidReservations: number;
  excludedStatuses: number;
};

const KUWAIT_HINT = /(?:kuwait|al[\s-]?jahra|fahahil|fahaheel|salmia|salmiya|الكويت|الجهراء|الفحيحيل|السالمية)/i;

export const normalizeUnoNumber = (value: string) => String(value || "")
  .trim()
  .replace(/\.0+$/, "")
  .replace(/\D/g, "");

export const isOperaEligibleStatus = (value: string) => {
  const status = String(value || "").trim().toLocaleLowerCase("en");
  if (["c", "ns", "-1"].includes(status) || /cancel|no[\s-]?show|ملغ|عدم حضور/.test(status)) return false;
  return ["1", "3", "m", "o", "n", "i"].includes(status)
    || /confirm|modif|مؤكد|معدل|معدّل/.test(status);
};

export const operaRegionForReservation = (reservation: UnoReservation): OperaRegion => {
  if (String(reservation.currency || "").trim().toUpperCase() === "KWD") return "kuwait";
  const location = `${reservation.property || ""} ${reservation.city || ""}`;
  return KUWAIT_HINT.test(location) ? "kuwait" : "saudi";
};

const toBatches = (numbers: string[], batchSize: number): OperaBatch[] => {
  const size = batchSize === 500 ? 500 : 250;
  const batches: OperaBatch[] = [];
  for (let index = 0; index < numbers.length; index += size) {
    const values = numbers.slice(index, index + size);
    batches.push({
      batch: batches.length + 1,
      count: values.length,
      value: values.join(","),
    });
  }
  return batches;
};

export const buildOperaExport = (
  reservations: UnoReservation[],
  batchSize: 250 | 500 = 250,
): OperaExportResult => {
  const seen = new Set<string>();
  const regions: Record<OperaRegion, string[]> = { saudi: [], kuwait: [] };
  let duplicateReservations = 0;
  let invalidReservations = 0;
  let excludedStatuses = 0;

  for (const reservation of reservations) {
    if (!isOperaEligibleStatus(reservation.status)) {
      excludedStatuses += 1;
      continue;
    }
    const number = normalizeUnoNumber(reservation.unoNumber);
    if (!/^\d{6,20}$/.test(number)) {
      invalidReservations += 1;
      continue;
    }
    if (seen.has(number)) {
      duplicateReservations += 1;
      continue;
    }
    seen.add(number);
    regions[operaRegionForReservation(reservation)].push(number);
  }

  return {
    saudi: { numbers: regions.saudi, batches: toBatches(regions.saudi, batchSize) },
    kuwait: { numbers: regions.kuwait, batches: toBatches(regions.kuwait, batchSize) },
    eligible: seen.size,
    duplicateReservations,
    invalidReservations,
    excludedStatuses,
  };
};
