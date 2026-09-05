import { describe, expect, it } from "vitest";
import { matchBookingCandidates } from "../../netlify/functions/_shared/bookingMatcher";
import type { UnoReservationRecord } from "../../netlify/functions/_shared/unoReportCore";

const reservation: UnoReservationRecord = {
  unoNumber: "4581",
  pmsNumber: "PMS778899",
  phone: "0501234567",
  guestName: "محمد أحمد القحطاني",
  agentName: "Agent One",
  property: "فندق الرياض",
  city: "الرياض",
  status: "Confirmed",
  checkIn: "2026-09-04",
  checkOut: "2026-09-06",
  bookingDate: "2026-08-20",
  channel: "Direct",
  amount: "900",
  currency: "SAR",
};

describe("employee booking matcher", () => {
  it("does not enumerate a guest from only the last four phone digits", () => {
    expect(matchBookingCandidates([reservation], "ابحث عن 4567").candidates).toEqual([]);
  });

  it("matches seven or more trailing phone digits but exposes only the last four", () => {
    const result = matchBookingCandidates([reservation], "ابحث عن 1234567");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].phoneLast4).toBe("4567");
    expect(result.candidates[0]).not.toHaveProperty("phone");
  });

  it("accepts an exact booking number or a full name plus date", () => {
    expect(matchBookingCandidates([reservation], "UNO 4581").candidates).toHaveLength(1);
    expect(matchBookingCandidates([reservation], "PMS778899").candidates).toHaveLength(1);
    expect(matchBookingCandidates([reservation], "محمد أحمد بتاريخ 2026-09-04").candidates).toHaveLength(1);
  });
});
