import { describe, expect, it } from "vitest";
import { buildPublicBookingReport } from "../../netlify/functions/_shared/bookingReport";
import { classifyReservationStatus, deduplicateReservationRows } from "../lib/reservationMetrics";

const row = (values: Record<string, string> = {}) => ({ "Resv No.": "123", "Property Name": "Boudl Olaya", "Agent Name": "Ali", "Booking Status": "Confirmed", ...values });
describe("reservation totals without inflation", () => {
  it("recognizes only complete status values and counts NS as canceled", () => {
    for (const value of ["M", "O", "N", "I", "Modified", "Confirmed"]) expect(classifyReservationStatus(value)).toBe("confirmed");
    for (const value of ["C", "NS", "No Show", "No_show", "ملغي"]) expect(classifyReservationStatus(value)).toBe("cancelled");
    for (const value of ["not cancelled", "cancellation pending", "", "unknown"]) expect(classifyReservationStatus(value)).toBe("ignored");
  });
  it("keeps different properties and PMS room confirmations distinct", () => {
    const report = buildPublicBookingReport([row(), row(), row({ "Property Name": "Aber Abha" }), row({ "PMS No": "A" }), row({ "PMS No": "B", "PMS Status": "NS" })]);
    expect(report.summary).toMatchObject({ confirmed: 2, cancelled: 1, duplicateRecords: 2 });
  });
  it("does not count an unresolved status or employee conflict as confirmed", () => {
    const report = buildPublicBookingReport([row(), row({ "Booking Status": "Cancelled" })]);
    expect(report.summary).toMatchObject({ confirmed: 0, cancelled: 0, ignored: 1, conflictingRecords: 1 });
  });
  it("uses an explicit newer update regardless of input order", () => {
    const old = row({ "Updated At": "2026-09-01T10:00:00Z" });
    const recent = row({ "Updated At": "2026-09-02T10:00:00Z", "Booking Status": "NS" });
    for (const input of [[old, recent], [recent, old]]) expect(buildPublicBookingReport(input).summary).toMatchObject({ confirmed: 0, cancelled: 1 });
  });
  it("preserves unidentified records and ignores similarly named unrelated headers", () => {
    expect(deduplicateReservationRows([{ Status: "M" }, { Status: "M" }]).bookings).toHaveLength(2);
    const report = buildPublicBookingReport([{ "Guest Status": "M", "Cancellation Policy": "Cancelled", "Agent Name": "Ali" }]);
    expect(report.summary).toMatchObject({ confirmed: 0, cancelled: 0, ignored: 1 });
  });
  it("exposes manual adjustments without changing source totals", () => {
    const report = buildPublicBookingReport([row()], { employeeAdjustments: { ali: { confirmedAdjustment: 2 } } });
    expect(report.summary.confirmed).toBe(1);
    expect(report.employees[0]).toMatchObject({ confirmed: 3, sourceConfirmed: 1, confirmedAdjustment: 2 });
  });
});
