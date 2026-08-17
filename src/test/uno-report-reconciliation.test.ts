import { describe, expect, it } from "vitest";
import {
  canonicalReservationKey,
  deduplicateUnoReservations,
  filterUnoReservations,
  parseReservationAmount,
  riyadhDateKey,
  summarizeUnoReservations,
  unoStatusGroup,
  type UnoReservationRecord,
} from "../../netlify/functions/_shared/unoReportCore";

const reservation = (patch: Partial<UnoReservationRecord> = {}): UnoReservationRecord => ({
  unoNumber: "1130439926",
  pmsNumber: "",
  phone: "0500000000",
  guestName: "Guest One",
  agentName: "Agent One",
  property: "Braira Al Nakheel",
  city: "Riyadh",
  status: "Confirmed",
  checkIn: "2026-08-18",
  checkOut: "2026-08-19",
  bookingDate: "2026-08-17T01:00:00+03:00",
  channel: "Voice",
  amount: "477.00",
  currency: "SAR",
  ...patch,
});

describe("UNO reconciled reporting", () => {
  it("deduplicates the same UNO reservation even when PMS appears later and merges richer fields", () => {
    const first = reservation({ pmsNumber: "", phone: "", amount: "" });
    const second = reservation({ pmsNumber: "PMS-8899", phone: "0555555555", amount: "489.00" });

    const result = deduplicateUnoReservations([first, second]);

    expect(result.reservations).toHaveLength(1);
    expect(result.duplicates).toBe(1);
    expect(result.reservations[0]).toMatchObject({
      unoNumber: "1130439926",
      pmsNumber: "PMS-8899",
      phone: "0555555555",
      amount: "489.00",
    });
  });

  it("keeps PMS-only reservations distinct by property", () => {
    const first = reservation({ unoNumber: "", pmsNumber: "7788", property: "Boudl Olaya" });
    const second = reservation({ unoNumber: "", pmsNumber: "7788", property: "Boudl Al Munsiyah" });
    expect(canonicalReservationKey(first)).not.toBe(canonicalReservationKey(second));
    expect(deduplicateUnoReservations([first, second]).reservations).toHaveLength(2);
  });

  it("uses Riyadh calendar dates instead of UTC around midnight", () => {
    expect(riyadhDateKey("2026-08-16T22:30:00Z")).toBe("2026-08-17");
    expect(riyadhDateKey("2026-08-17")).toBe("2026-08-17");
  });

  it("maps all operational statuses consistently", () => {
    for (const value of ["1", "M", "O", "N", "I", "Confirmed", "مؤكد"]) {
      expect(unoStatusGroup(value)).toBe("confirmed");
    }
    for (const value of ["3", "Modified", "معدل", "معدّل"]) {
      expect(unoStatusGroup(value)).toBe("modified");
    }
    for (const value of ["-1", "2", "C", "NS", "Cancelled", "No-show", "عدم حضور"]) {
      expect(unoStatusGroup(value)).toBe("cancelled");
    }
  });

  it("treats Modified as active confirmed when confirmed is selected", () => {
    const rows = [
      reservation({ unoNumber: "1", status: "Confirmed" }),
      reservation({ unoNumber: "2", status: "Modified" }),
      reservation({ unoNumber: "3", status: "Cancelled" }),
    ];
    const filtered = filterUnoReservations(rows, {
      dateType: "booking",
      from: "2026-08-01",
      to: "2026-08-31",
      property: "all",
      status: "confirmed",
    });
    expect(filtered.map((item) => item.unoNumber)).toEqual(["1", "2"]);
  });

  it("audits revenue per currency without combining SAR and KWD", () => {
    const rows = [
      reservation({ unoNumber: "1", status: "Confirmed", amount: "477.00", currency: "SAR" }),
      reservation({ unoNumber: "2", status: "Modified", amount: "1,200.50", currency: "SAR" }),
      reservation({ unoNumber: "3", status: "Cancelled", amount: "350", currency: "SAR" }),
      reservation({ unoNumber: "4", status: "Confirmed", amount: "42.750", currency: "KWD" }),
      reservation({ unoNumber: "5", status: "NS", amount: "20.000", currency: "KWD" }),
    ];

    const summary = summarizeUnoReservations(rows);
    expect(summary).toMatchObject({
      total: 5,
      confirmed: 3,
      modified: 1,
      cancelled: 2,
      other: 0,
      missingAgent: 0,
      missingAmount: 0,
    });
    expect(summary.confirmedRevenueByCurrency).toEqual({ SAR: 1677.5, KWD: 42.75 });
    expect(summary.cancelledRevenueByCurrency).toEqual({ SAR: 350, KWD: 20 });
  });

  it("parses formatted and negative amounts safely", () => {
    expect(parseReservationAmount("1,250.75 SAR")).toBe(1250.75);
    expect(parseReservationAmount("(120.50)")).toBe(-120.5);
    expect(parseReservationAmount("")).toBeNull();
  });
});
