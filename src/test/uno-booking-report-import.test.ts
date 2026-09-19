import { describe, expect, it } from "vitest";
import {
  inspectBookingReportText,
  isUnoBookingSourceFormat,
  parseBookingReportText,
  parseUnoSpreadsheetXml,
} from "../../netlify/functions/_shared/bookingCsv";
import { buildPublicBookingReport } from "../../netlify/functions/_shared/bookingReport";

const unoXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Reservations"><Table>
    <Row>
      <Cell><Data ss:Type="String">Booking time</Data></Cell>
      <Cell><Data ss:Type="String">Guest Name</Data></Cell>
      <Cell><Data ss:Type="String">Agent Name</Data></Cell>
      <Cell><Data ss:Type="String">Resv. no.</Data></Cell>
      <Cell><Data ss:Type="String">Check-in</Data></Cell>
      <Cell><Data ss:Type="String">Check-out</Data></Cell>
      <Cell><Data ss:Type="String">Booking Status</Data></Cell>
    </Row>
    <Row><Cell><Data ss:Type="String">10 Jul, 08:00</Data></Cell><Cell><Data ss:Type="String">Guest &amp; One</Data></Cell><Cell><Data ss:Type="String">Hani Alotaibi</Data></Cell><Cell><Data ss:Type="String">1001</Data></Cell><Cell><Data ss:Type="String">10 Jul 26</Data></Cell><Cell><Data ss:Type="String">11 Jul 26</Data></Cell><Cell><Data ss:Type="String">Confirmed</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">11 Jul, 09:00</Data></Cell><Cell><Data ss:Type="String">Guest Two</Data></Cell><Cell><Data ss:Type="String">UNO-Voice</Data></Cell><Cell><Data ss:Type="String">1002</Data></Cell><Cell><Data ss:Type="String">11 Jul 26</Data></Cell><Cell><Data ss:Type="String">12 Jul 26</Data></Cell><Cell><Data ss:Type="String">Confirmed</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">12 Jul, 10:00</Data></Cell><Cell><Data ss:Type="String">Guest Three</Data></Cell><Cell><Data ss:Type="String">Hani Alotaibi</Data></Cell><Cell><Data ss:Type="String">1003</Data></Cell><Cell><Data ss:Type="String">12 Jul 26</Data></Cell><Cell><Data ss:Type="String">13 Jul 26</Data></Cell><Cell><Data ss:Type="String">Cancelled</Data></Cell></Row>
    <Row><Cell><Data ss:Type="String">12 Jul, 10:00</Data></Cell><Cell><Data ss:Type="String">Duplicate</Data></Cell><Cell><Data ss:Type="String">Hani Alotaibi</Data></Cell><Cell><Data ss:Type="String">1003</Data></Cell><Cell><Data ss:Type="String">12 Jul 26</Data></Cell><Cell><Data ss:Type="String">13 Jul 26</Data></Cell><Cell><Data ss:Type="String">Cancelled</Data></Cell></Row>
  </Table></Worksheet>
</Workbook>`;

describe("UNO employee booking report import", () => {
  it("marks only UNO API and UNO SpreadsheetML as trusted booking sources", () => {
    expect(isUnoBookingSourceFormat("uno-live-api")).toBe(true);
    expect(isUnoBookingSourceFormat("uno-spreadsheetml")).toBe(true);
    expect(isUnoBookingSourceFormat("csv")).toBe(false);
  });
  it("recognizes SpreadsheetML exported with an .xls extension", () => {
    const records = parseUnoSpreadsheetXml(unoXml);
    expect(records).toHaveLength(4);
    expect(records[0]["Guest Name"]).toBe("Guest & One");

    const parsed = parseBookingReportText(unoXml, "completed-reservations.xls");
    expect(parsed.sourceFormat).toBe("uno-spreadsheetml");
    expect(parsed.sourceRows).toBe(4);
    expect(parsed.bookings).toHaveLength(3);
    expect(parsed.duplicateReservations).toBe(1);
  });

  it("previews status, attribution, duplicates, and date range before saving", () => {
    const { bookings, stats } = inspectBookingReportText(unoXml, "completed-reservations.xls");
    expect(stats).toMatchObject({
      total: 3,
      confirmed: 2,
      cancelled: 1,
      classifiedTotal: 3,
      ignored: 0,
      attributedRecords: 2,
      unattributedRecords: 1,
      employeeCount: 1,
      uniqueReservations: 3,
      duplicateReservations: 1,
      dateFrom: "2026-07-10",
      dateTo: "2026-07-12",
    });
    expect(stats.systemAccounts).toEqual([{ name: "UNO-Voice", records: 1 }]);

    const publicReport = buildPublicBookingReport(bookings, {}, null, { dateFrom: stats.dateFrom, dateTo: stats.dateTo });
    expect(publicReport.summary).toMatchObject({ confirmed: 2, cancelled: 1, unattributed: 1, employeeCount: 1 });
    expect(publicReport.period.label).toBe("2026-07-10 — 2026-07-12");
    expect(publicReport.employees).toEqual([
      expect.objectContaining({ name: "Hani Alotaibi", confirmed: 1, cancelled: 1 }),
    ]);
  });

  it("rejects SpreadsheetML files that do not have the UNO report columns", () => {
    const invalid = unoXml.replace("Agent Name", "Created By");
    expect(() => parseUnoSpreadsheetXml(invalid)).toThrow(/أعمدة تقرير UNO/);
  });
});
