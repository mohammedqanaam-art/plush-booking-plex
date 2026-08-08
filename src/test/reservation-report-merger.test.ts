import { describe, expect, it } from "vitest";
import {
  detectReservationReportSource,
  mergeReservationReports,
  normalizeReservationStatus,
  parseReservationReportFile,
  type ParsedReservationReport,
} from "@/lib/reservationReportMerger";
import * as XLSX from "@e965/xlsx";

describe("reservation report merger", () => {
  it("recognizes UNO and CRO exports", () => {
    expect(detectReservationReportSource("completed-reservations-20260731.xls", [{ "Created By": "Agent", "Reservation Status": "Confirmed", "Property Name": "Boudl" }])).toBe("UNO");
    expect(detectReservationReportSource("cro-july.csv", [{ "Agent name": "Agent", "All stute": "N" }])).toBe("CRO");
  });

  it("recognizes the current UNO and CRO CSV layouts even though both use Agent Name", () => {
    expect(detectReservationReportSource("dashboards(77).csv", [{
      "Agent Name": "ALMUTAIRI HISHAM", AgentID: "1", "Chain/HotelGroup": "BHR", "Resv ID": "LLP8118UBP", St: "N",
    }])).toBe("CRO");
    expect(detectReservationReportSource("Reservations_20260807_204114.csv", [{
      BookingTime: "7 Aug, 20:31", "Property Name": "Boudl", "Agent Name": "Hisham Almutairi", "Resv No.": "421821993", "Booking Status": "Confirmed",
    }])).toBe("UNO");
  });

  it("normalizes UNO text statuses to the approved reservation status codes", () => {
    expect(normalizeReservationStatus("Confirmed")).toBe("N");
    expect(normalizeReservationStatus("Modified")).toBe("M");
    expect(normalizeReservationStatus("Cancelled")).toBe("C");
    expect(normalizeReservationStatus("No Show")).toBe("NS");
  });

  it("reads a real legacy XLS workbook like the UNO completed-reservations export", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["UNO Completed Reservations"],
      ["Booking Number", "Created By", "Reservation Status", "Property Name"],
      ["UNO-9001", "Agent UNO", "Confirmed", "Boudl Test"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Reservations");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xls" });
    const file = new File([bytes], "completed-reservations-20260731.xls", { type: "application/vnd.ms-excel" });

    const parsed = await parseReservationReportFile(file);
    expect(parsed.source).toBe("UNO");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]["Booking Number"]).toBe("UNO-9001");
  });

  it("merges more than two UNO/CRO reports and removes duplicate reservation numbers", () => {
    const reports: ParsedReservationReport[] = [
      {
        fileName: "cro-1.csv",
        source: "CRO",
        rows: [
          { "Reservation Number": "R-100", "Agent name": "Agent A", Status: "N", Hotel: "Boudl A" },
          { "Reservation Number": "R-101", "Agent name": "Agent B", Status: "M", Hotel: "Boudl B" },
        ],
      },
      {
        fileName: "completed-reservations-1.xls",
        source: "UNO",
        rows: [
          { "Booking Number": "R-100", "Created By": "Agent A", "Reservation Status": "Confirmed", "Property Name": "Boudl A" },
          { "Booking Number": "R-102", "Created By": "Agent C", "Reservation Status": "Cancelled", "Property Name": "Boudl C" },
        ],
      },
      {
        fileName: "cro-2.csv",
        source: "CRO",
        rows: [
          { "Confirmation Number": "R-103", "Agent Name": "Agent D", "Booking Status": "NS" },
        ],
      },
    ];

    const result = mergeReservationReports(reports);
    expect(result.stats.files).toBe(3);
    expect(result.stats.inputRows).toBe(5);
    expect(result.stats.uniqueRows).toBe(4);
    expect(result.stats.duplicatesRemoved).toBe(1);
    expect(result.stats.confirmed).toBe(2);
    expect(result.stats.cancelled).toBe(2);
    expect(result.rows.find((row) => row["Reservation Number"] === "R-100")?.Source).toBe("CRO + UNO");
  });

  it("flags a cross-system status conflict and prefers a cancellation when no newer timestamp exists", () => {
    const result = mergeReservationReports([
      { fileName: "cro.csv", source: "CRO", rows: [{ "Reservation Number": "R-200", "Agent name": "Agent", Status: "N" }] },
      { fileName: "uno.xls", source: "UNO", rows: [{ "Booking Number": "R-200", "Created By": "Agent", "Reservation Status": "Cancelled" }] },
    ]);

    expect(result.stats.statusConflicts).toBe(1);
    expect(result.rows[0].Status).toBe("C");
    expect(result.rows[0].Conflict).toBe("YES");
  });

  it("merges the current CRO and UNO column layouts and consolidates employee name order", () => {
    const result = mergeReservationReports([
      {
        fileName: "dashboards(77).csv",
        source: "CRO",
        rows: [{
          "Agent Name": "ALMUTAIRI HISHAM", "Resv ID": "LLP8118UBP", St: "M", First: "Abdulmohsen", Last: "Abdulaziz",
          Hotel: "Boudl Al Jubail", "Check In": "2026/08/15", CheckOutTime: "2026/08/20 00:00", Room: "STD03",
        }],
      },
      {
        fileName: "Reservations_20260807_204114.csv",
        source: "UNO",
        rows: [{
          "Agent Name": "Hisham Almutairi", "Resv No.": "955757054", "Booking Status": "Confirmed", "First Name": "YAZEED", "Last Name": "ALQAHTANI",
          "Property Name": "Boudl Wadi Al Dawasir", BookingTime: "7 Aug, 20:24", CheckIn: "07 Aug 26", Checkout: "08 Aug 26", "Room Code": "STDK",
        }],
      },
    ]);

    expect(result.stats.sourceRows).toEqual({ CRO: 1, UNO: 1, UNKNOWN: 0 });
    expect(result.stats.withoutReservationNumber).toBe(0);
    expect(result.stats.confirmed).toBe(2);
    expect(result.rows.map((row) => row["Agent name"])).toEqual(["Hisham Almutairi", "Hisham Almutairi"]);
    expect(result.rows[0]["Guest Name"]).toBe("Abdulmohsen Abdulaziz");
    expect(result.rows[1]["Booking Date"]).toBe("7 Aug, 20:24");
  });

  it("consolidates minor cross-system spelling differences for the same employee", () => {
    const result = mergeReservationReports([
      { fileName: "cro.csv", source: "CRO", rows: [{ "Resv ID": "C1", "Agent Name": "ALQAHTANI HALA", St: "N" }] },
      { fileName: "uno.csv", source: "UNO", rows: [{ "Resv No.": "U1", "Agent Name": "Hala Alqahtan", "Booking Status": "Confirmed" }] },
    ]);

    expect(new Set(result.rows.map((row) => row["Agent name"]))).toEqual(new Set(["Hala Alqahtan"]));
  });
});
