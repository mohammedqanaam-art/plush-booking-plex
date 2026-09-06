import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFullReport } from "../../netlify/functions/uno-report";

const configuration = {
  apiBaseUrl: "https://uno-prod-ui-api-cpayzgdkqq-uc.a.run.app/api/",
  voiceApiBaseUrl: "https://ibe-prod-api-cpayzgdkqq-uc.a.run.app/api/",
  password: "test-only",
  appVersion: "29.3",
};
const session = {
  token: "test-only", userId: "test", sessionId: "test", ipAddress: "",
  chainId: "test-chain", accountName: "Test", properties: [{ id: "test-hotel", name: "Test Hotel" }],
};
const filters = { dateType: "booking" as const, from: "2026-09-01", to: "2026-09-06", property: "all", status: "all" as const };
const rows = (count: number, offset = 0) => Array.from({ length: count }, (_, index) => ({
  reservationNo: String(offset + index + 1), bookingDate: "2026-09-05", statusName: "Confirmed",
  propertyName: "Test Hotel", agentName: "Test Agent", amount: "100", currency: "SAR",
}));
const response = (records: ReturnType<typeof rows>, total?: number | null) => Response.json({
  body: { reservationsRecords: records, ...(total !== undefined ? { totalRecords: total } : {}) },
});
const run = () => fetchFullReport(configuration, session, filters);

afterEach(() => vi.restoreAllMocks());

describe("UNO report completeness before publication", () => {
  it("accepts a complete report and preserves native Booking Date filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response(rows(2), 2));
    const report = await run();
    expect(report.reservations).toHaveLength(2);
    expect(report.quality).toMatchObject({ sourceRows: 2, reportedTotal: 2, truncated: false });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ bookingDateFrom: filters.from, bookingDateTo: filters.to });
    expect(body).not.toHaveProperty("checkoutDateFrom");
  });

  it("accepts an explicitly empty reservation report", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response([], 0));
    expect((await run()).reservations).toEqual([]);
  });

  it("recovers a capped first response using complete pagination", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(rows(1), 3))
      .mockResolvedValueOnce(response(rows(3), 3));
    const report = await run();
    expect(report.reservations).toHaveLength(3);
    expect(report.quality.fetchMode).toBe("paged");
  });

  it("collects every page before returning reconciled reservations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(rows(1000), 2500))
      .mockResolvedValueOnce(response(rows(1000), 2500))
      .mockResolvedValueOnce(response(rows(1000, 1000), 2500))
      .mockResolvedValueOnce(response(rows(500, 2000), 2500));
    const report = await run();
    expect(report.reservations).toHaveLength(2500);
    expect(report.quality).toMatchObject({ fetchMode: "paged", pages: 3, reportedTotal: 2500, sourceRows: 2500 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects a truncated report at the safety ceiling when its total is unknown", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const params = new URL(String(url)).searchParams;
      return response(rows(1000, (Number(params.get("page")) - 1) * 1000));
    });
    // Map the result before asserting so a regression never prints 50,000 records.
    const outcome = await run().then(() => "accepted", (error: Error) => error.message);
    expect(outcome).toBe("UNO_REPORT_INCOMPLETE");
    expect(fetchMock).toHaveBeenCalledTimes(51);
  });

  it("rejects a short page when UNO declares more records", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(rows(1), 5))
      .mockResolvedValueOnce(response(rows(2), 5));
    await expect(run()).rejects.toThrow("UNO_REPORT_INCOMPLETE");
  });

  it("rejects repeated pages while records are missing", async () => {
    const page = rows(1000);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(page, 2500));
    await expect(run()).rejects.toThrow("UNO_REPORT_INCOMPLETE");
  });

  it("rejects repeated pages without a declared total or proven completion", async () => {
    const page = rows(1000);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => response(page));
    await expect(run()).rejects.toThrow("UNO_REPORT_INCOMPLETE");
  });

  it("accepts the full unbounded report when UNO ignores pagination", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(rows(1200), 1200))
      .mockImplementation(async () => response(rows(1000), 1200));
    expect((await run()).reservations).toHaveLength(1200);
  });

  it("honors a larger total discovered on later pages even if neither result grows", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(rows(1200), 1200))
      .mockResolvedValueOnce(response(rows(1000), 2000))
      .mockResolvedValueOnce(response(rows(200, 1000), 2000));
    await expect(run()).rejects.toThrow("UNO_REPORT_INCOMPLETE");
  });

  it("does not treat a null nested count as zero and hide a larger root total", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ body: { reservationsRecords: rows(1), totalRecords: null }, totalRecords: 3 }))
      .mockResolvedValueOnce(response(rows(1), 3));
    await expect(run()).rejects.toThrow("UNO_REPORT_INCOMPLETE");
  });

  it("rejects an error envelope delivered with HTTP 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ error: "report unavailable" }));
    await expect(run()).rejects.toThrow("UNO_REPORT_INVALID_RESPONSE");
  });

  it.each([
    { errors: [{ message: "unavailable" }] },
    { body: { reservationsRecords: [{ message: "unavailable" }] } },
    { body: { reservationsRecords: [...rows(1), null] } },
  ])("rejects non-reservation objects instead of publishing empty or partial data: %j", async (payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(payload));
    await expect(run()).rejects.toThrow("UNO_REPORT_INVALID_RESPONSE");
  });

  it("selects a recognizable fallback reservation array instead of unrelated metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({
      data: rows(1), warnings: [{ message: "one" }, { message: "two" }], totalRecords: 1,
    }));
    expect((await run()).reservations).toHaveLength(1);
  });

  it.each([
    "reservationNo", "ReservationNo", "reservationNumber", "ReservationNumber",
    "unoReservationNo", "otaBookingID", "OTABookingID", "pmsid", "pmsId", "PMSID",
    "pmsConfirmationNo", "PMSConfirmationNo", "pmsReservationNo",
  ])("distinguishes complete pages using the supported %s identifier", async (identifier) => {
    const page = (offset: number) => rows(1000, offset).map(({ reservationNo, ...record }) => ({
      ...record, [identifier]: reservationNo,
    }));
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ body: { reservationsRecords: page(0) } }))
      .mockResolvedValueOnce(Response.json({ body: { reservationsRecords: page(0) } }))
      .mockResolvedValueOnce(Response.json({ body: { reservationsRecords: page(1000) } }))
      .mockResolvedValueOnce(response([]));
    expect((await run()).reservations).toHaveLength(2000);
  });

  it("rejects malformed JSON instead of accepting an empty report", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>upstream error</html>"));
    await expect(run()).rejects.toThrow("UNO_REPORT_INVALID_RESPONSE");
  });

  it("preserves the authentication error even when its body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    await expect(run()).rejects.toThrow("UNO_SESSION_EXPIRED");
  });
});
