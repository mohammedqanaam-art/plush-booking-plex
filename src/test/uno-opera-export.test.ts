import { describe, expect, it } from "vitest";
import type { UnoReservation } from "@/lib/api";
import { buildOperaExport, isOperaEligibleStatus } from "@/lib/unoOperaExport";

const reservation = (patch: Partial<UnoReservation>): UnoReservation => ({
  unoNumber: "100000001",
  pmsNumber: "PMS-1",
  phone: "0500000000",
  guestName: "Guest",
  agentName: "Agent",
  property: "Boudl Olaya",
  city: "Riyadh",
  status: "Confirmed",
  checkIn: "2026-08-09",
  checkOut: "2026-08-10",
  bookingDate: "2026-08-09",
  channel: "Voice",
  amount: "500",
  currency: "SAR",
  ...patch,
});

describe("UNO OPERA export", () => {
  it("treats confirmed and modified reservations as OPERA eligible", () => {
    expect(isOperaEligibleStatus("Confirmed")).toBe(true);
    expect(isOperaEligibleStatus("Modified")).toBe(true);
    expect(isOperaEligibleStatus("3")).toBe(true);
    expect(isOperaEligibleStatus("Cancelled")).toBe(false);
    expect(isOperaEligibleStatus("NS")).toBe(false);
  });

  it("separates Saudi and Kuwait and emits comma-only batches", () => {
    const result = buildOperaExport([
      reservation({ unoNumber: "100 000 001.0" }),
      reservation({ unoNumber: "100000002", status: "Modified" }),
      reservation({ unoNumber: "200000001", property: "Boudl Salmia", city: "Al Jahra", currency: "" }),
      reservation({ unoNumber: "200000002", property: "Boudl Fahahil", currency: "KWD" }),
      reservation({ unoNumber: "100000002" }),
      reservation({ unoNumber: "300000001", status: "Cancelled" }),
      reservation({ unoNumber: "12" }),
    ], 250);

    expect(result.saudi.numbers).toEqual(["100000001", "100000002"]);
    expect(result.kuwait.numbers).toEqual(["200000001", "200000002"]);
    expect(result.saudi.batches[0].value).toBe("100000001,100000002");
    expect(result.saudi.batches[0].value).not.toMatch(/\s/);
    expect(result.duplicateReservations).toBe(1);
    expect(result.excludedStatuses).toBe(1);
    expect(result.invalidReservations).toBe(1);
  });

  it("splits exactly at the selected OPERA batch size", () => {
    const rows = Array.from({ length: 501 }, (_, index) => reservation({ unoNumber: String(1_000_000_000 + index) }));
    const result = buildOperaExport(rows, 250);
    expect(result.saudi.batches.map((batch) => batch.count)).toEqual([250, 250, 1]);
    expect(result.saudi.batches.every((batch) => !batch.value.includes(", "))).toBe(true);
  });
});
