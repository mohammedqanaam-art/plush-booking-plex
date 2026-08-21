import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createReservationSearchPayload,
  currentMonthUnoSyncFilters,
  fetchWithUnoVersionFallback,
  filterReservationsForReport,
  isCanonicalUnoSyncFilters,
  isTrustedRateGainUrl,
  normalizeReservation,
  parseUnoReportFilters,
  reservationToBookingRecord,
  saveReservationSnapshot,
  unoAuthenticationHeaders,
} from "../../netlify/functions/uno-connection";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UNO integration boundary", () => {
  it("allows only approved HTTPS UNO endpoints", () => {
    expect(isTrustedRateGainUrl("https://unolive.rategain.com/")).toBe(true);
    expect(isTrustedRateGainUrl("https://unolive-voice.rategain.com/create-booking")).toBe(true);
    expect(isTrustedRateGainUrl("https://api.rategain.com/uno")).toBe(true);
    expect(isTrustedRateGainUrl("https://uno-prod-ui-api-1087875874170.us-central1.run.app/api/")).toBe(true);
    expect(isTrustedRateGainUrl("https://uno-prod-ui-api-cpayzgdkqq-uc.a.run.app/api/")).toBe(true);
    expect(isTrustedRateGainUrl("https://v29-2---uno-prod-ui-api-cpayzgdkqq-uc.a.run.app/api/")).toBe(true);
    expect(isTrustedRateGainUrl("https://ibe-prod-api-cpayzgdkqq-uc.a.run.app/api/")).toBe(true);
    expect(isTrustedRateGainUrl("http://unolive.rategain.com/")).toBe(false);
    expect(isTrustedRateGainUrl("https://rategain.com.attacker.example/")).toBe(false);
    expect(isTrustedRateGainUrl("https://fake-uno-api.us-central1.run.app/api/")).toBe(false);
    expect(isTrustedRateGainUrl("https://example.com/")).toBe(false);
  });

  it("keeps UNO credentials and sessions server-side and routes report sync through reconciliation", () => {
    const root = process.cwd();
    const page = fs.readFileSync(path.join(root, "src/pages/AdminUno.tsx"), "utf8");
    const fn = fs.readFileSync(path.join(root, "netlify/functions/uno-connection.ts"), "utf8");
    const report = fs.readFileSync(path.join(root, "netlify/functions/uno-report.ts"), "utf8");
    const bookings = fs.readFileSync(path.join(root, "netlify/functions/bookings.ts"), "utf8");
    const bookingCsv = fs.readFileSync(path.join(root, "netlify/functions/_shared/bookingCsv.ts"), "utf8");
    const schedule = fs.readFileSync(path.join(root, "netlify/functions/uno-sync-scheduled.ts"), "utf8");
    const background = fs.readFileSync(path.join(root, "netlify/functions/uno-sync-background.ts"), "utf8");
    const api = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

    expect(app).toContain('path="/admin/uno"');
    expect(page).not.toContain("UNO_USERNAME");
    expect(page).not.toContain("UNO_PASSWORD");
    expect(page).not.toContain("userToken");
    expect(page).not.toContain("SessionID");
    expect(fn).toContain('Netlify.env.get(key)');
    expect(fn).toContain('trimmedEnv("UNO_LOGIN_EMAIL")');
    expect(fn).toContain('rawEnv("UNO_LOGIN_PASSWORD")');
    expect(fn).toContain('name: "uno-sessions"');
    expect(fn).toContain('deploy.context === "production"');
    expect(fn).toContain('getDeployStore("uno-sessions")');
    expect(fn).toContain('createCipheriv("aes-256-gcm"');
    expect(fn).toContain('createHash("sha256").update(configuration.password)');
    expect(fn).toContain('path: "/api/admin/uno"');
    expect(fn).toContain('action === "list"');
    expect(fn).toContain('action === "export"');
    expect(fn).toContain("finalizeAuthenticatedConnection");
    expect(fn).toContain("publishProductivityReport");
    expect(fn).toContain("saveBookingRecords");
    expect(page).toContain("api.exportUnoReport(reportFilters)");
    expect(page).toContain('autoComplete="one-time-code"');
    expect(page).toContain("الملغاة / NS");
    expect(fn).toContain('const DEFAULT_UNO_RESERVATIONS_URL = "https://unolive-voice.rategain.com/view-reservations?brandId=3868248c-c053-43f2-b9c8-3188c74dfeb5&chainId=cdcc2737-a6b9-45bc-9d91-b1a760fb8026"');
    expect(fn).toContain('trimmedEnv("UNO_RESERVATIONS_URL")');
    expect(fn).toContain('trimmedEnv("UNO_LOGIN_URL")');
    expect(fn).toContain('const DEFAULT_UNO_APP_VERSION = "29.3"');
    expect(fn).toContain('const DEFAULT_UNO_VOICE_API_BASE_URL = "https://ibe-prod-api-cpayzgdkqq-uc.a.run.app/api/"');
    expect(fn).toContain('const VOICE_SEARCH_PATH = "voice/allreservaions"');
    expect(fn).toContain('trimmedEnv("UNO_VOICE_API_BASE_URL")');
    expect(fn).toContain('UserID: "VOICE"');
    expect(fn).not.toMatch(/Bearer eyJ/);
    expect(fn).toContain("UNO_REFRESH_WINDOW_MS");
    expect(fn).toContain("AuthenticateUser/RefreshToken/");
    expect(fn).toContain("refreshConnectedState");
    expect(fn).toContain('rawEnv("UNO_SYNC_SECRET")');
    expect(fn).toContain('req.headers.get("x-uno-sync-key")');
    expect(background).toContain('req.headers.get("x-uno-sync-key")');
    expect(background).toContain('"X-UNO-Sync-Key": secret');
    expect(schedule).toContain('"X-UNO-Sync-Key": secret');
    expect(`${fn}\n${background}\n${schedule}`).not.toContain("X-UNO-Sync-Secret");
    expect(`${fn}\n${background}\n${schedule}`).not.toContain("x-uno-sync-secret");
    expect(schedule).toContain('schedule: "*/10 * * * *"');
    expect(schedule).toContain('"dispatch-keepalive"');
    expect(schedule).toContain('/.netlify/functions/uno-sync-background');
    expect(schedule).not.toContain('new URL("/api/admin/uno"');
    expect(background).toContain('"/api/admin/uno-report"');
    expect(background).toContain('"sync-system"');
    expect(background).toContain('"keepalive-system"');
    expect(fn).toContain('action === "keepalive-system"');
    expect(fn).toContain("readSharedActiveState");
    expect(schedule).toContain('Netlify.env.get("UNO_PASSWORD")');
    expect(schedule).toContain('createHash("sha256").update(`uno-sync:${password}`).digest("hex")');
    expect(fn).not.toContain('trimmedEnv("UNO_BOOKING_URL")');
    expect(page).toContain("فتح حجوزات Voice");
    expect(page).toContain("تصدير ومزامنة UNO");
    expect(page).toContain("تحديث تقرير الإنتاجية من UNO");
    expect(page).toContain("navigator.clipboard.writeText");
    expect(page).toContain("تصدير OPERA");

    expect(report).toContain('path: "/api/admin/uno-report"');
    expect(report).toContain('const MAX_REPORT_ROWS = 50_000');
    expect(report).toContain('const DEFAULT_UNO_APP_VERSION = "29.3"');
    expect(report).toContain('sourceSystem: "UNO"');
    expect(report).toContain('const PAGED_SIZE = 1_000');
    expect(report).toContain("deduplicateUnoReservations");
    expect(report).toContain("summarizeUnoReservations");
    expect(report).toContain("staleDataPreserved: true");
    expect(fn).not.toContain("UNO_SNAPSHOT_LIMIT");
    expect(bookings).toContain('store.get("uno-data"');
    expect(bookings).toContain("ملفات CSV أو CRO لا تستبدل الأرقام الحالية");
    expect(bookingCsv).toContain('sourceFormat: "uno-live-api"');
    expect(api).toContain('payload.action === "export" ? "/api/admin/uno-report" : "/api/admin/uno"');
  });

  it("does not send a version header during UNO authentication", () => {
    const headers = unoAuthenticationHeaders();
    expect(headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(headers).not.toHaveProperty("AppVersion");
  });

  it("retries authenticated UNO requests without a stale version header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("version mismatch", { status: 409 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithUnoVersionFallback(
      new URL("https://uno-prod-ui-api-cpayzgdkqq-uc.a.run.app/api/probe"),
      {
        method: "POST",
        headers: {
          AppVersion: "29.2",
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      1_000,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("AppVersion")).toBe("29.2");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).has("AppVersion")).toBe(false);
  });

  it("builds a property-scoped reservation lookup", () => {
    const payload = createReservationSearchPayload({
      chainId: "4",
      properties: [
        { id: "11", name: "One" },
        { id: "12", name: "Two" },
      ],
    }, "pms", "PMS-9988");

    expect(payload.ChainID).toBe("4");
    expect(payload.propertyIds).toEqual(["11", "12"]);
    expect(payload.searchText).toBe("PMS-9988");
    expect(payload.isExcelDownload).toBe(false);
    expect(payload).not.toHaveProperty("propertyId");
    expect(payload).not.toHaveProperty("pmsConfirmationNo");
  });

  it("sends UNO its native date, property, and status filters before downloading", () => {
    const payload = createReservationSearchPayload({
      chainId: "4",
      properties: [
        { id: "11", name: "Braira Olaya" },
        { id: "12", name: "Braira Qurtubah" },
      ],
    }, undefined, "", {
      dateType: "booking",
      from: "2026-08-01",
      to: "2026-08-13",
      property: "Braira Olaya",
      status: "confirmed",
    });

    expect(payload).toMatchObject({
      ChainID: "4",
      propertyIds: ["11"],
      BookingStatus: 1,
      SourceType: "Voice",
      bookingDateFrom: "2026-08-01",
      bookingDateTo: "2026-08-13",
    });
  });

  it("builds a property-scoped list request without a search value", () => {
    const payload = createReservationSearchPayload({
      chainId: "4",
      properties: [{ id: "11", name: "One" }],
    });

    expect(payload).toEqual({
      ChainID: "4",
      propertyIds: ["11"],
      BookingStatus: 0,
      Channel: "0",
      SourceType: "Voice",
      searchText: "",
      isExcelDownload: false,
    });
  });

  it("normalizes UNO reservation fields without exposing the raw response", () => {
    expect(normalizeReservation({
      reservationNo: "UNO-123",
      pmsid: "PMS-456",
      phoneNo: "0501234567",
      firstName: "Mohammed",
      lastName: "Qanaam",
      createdBy: "Hani Alotaibi",
      name: "Hotel",
      resStatus: 1,
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      amountAfterTax: 700,
      currency: "SAR",
      internalSecret: "must-not-leak",
    })).toEqual({
      unoNumber: "UNO-123",
      pmsNumber: "PMS-456",
      phone: "0501234567",
      guestName: "Mohammed Qanaam",
      agentName: "Hani Alotaibi",
      property: "Hotel",
      city: "",
      status: "مؤكد",
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      bookingDate: "",
      channel: "",
      amount: "700",
      currency: "SAR",
    });
  });

  it("validates the UNO report period used across OTP and scheduled sync", () => {
    expect(parseUnoReportFilters({
      dateType: "booking",
      from: "2026-08-01",
      to: "2026-08-08",
      property: "all",
      status: "confirmed",
    })).toEqual({
      dateType: "booking",
      from: "2026-08-01",
      to: "2026-08-08",
      property: "all",
      status: "confirmed",
    });
    expect(() => parseUnoReportFilters({ from: "2026-07-01", to: "2026-08-08" })).toThrow(/30/);
  });

  it("keeps the automatic snapshot on a moving current-month scope", () => {
    const filters = currentMonthUnoSyncFilters();
    expect(filters).toMatchObject({
      dateType: "booking",
      property: "all",
      status: "all",
    });
    expect(filters.from).toBe(`${filters.to.slice(0, 7)}-01`);
    expect(isCanonicalUnoSyncFilters(filters)).toBe(true);
    expect(isCanonicalUnoSyncFilters({ ...filters, property: "Braira Olaya" })).toBe(false);
    expect(isCanonicalUnoSyncFilters({ ...filters, status: "confirmed" })).toBe(false);
  });

  it("does not clip a valid UNO month at the old 5,000-row UI limit", async () => {
    const reservations = Array.from({ length: 5_001 }, (_, index) => ({
      unoNumber: `UNO-${index + 1}`,
      pmsNumber: "",
      phone: "",
      guestName: `Guest ${index + 1}`,
      agentName: "Agent One",
      property: "Braira Olaya",
      city: "Riyadh",
      status: "M",
      checkIn: "2026-08-20",
      checkOut: "2026-08-21",
      bookingDate: "2026-08-19T23:30:00Z",
      channel: "Voice",
      amount: "100",
      currency: "SAR",
    }));

    const snapshot = await saveReservationSnapshot(
      reservations,
      "manual",
      undefined,
      undefined,
      undefined,
      false,
    );

    expect(snapshot.sourceSystem).toBe("UNO");
    expect(snapshot.total).toBe(5_001);
    expect(snapshot.reservations).toHaveLength(5_001);
    expect(snapshot.quality).toMatchObject({ sourceRows: 5_001, truncated: false });
  });

  it("deduplicates on the UNO number even when PMS is added later", async () => {
    const base = normalizeReservation({
      reservationNo: "UNO-9988",
      createdBy: "Agent One",
      resStatus: "M",
      reservationDate: "2026-08-17",
    });
    const snapshot = await saveReservationSnapshot([
      base,
      { ...base, pmsNumber: "PMS-7788", phone: "0555555555" },
    ], "manual", undefined, undefined, undefined, false);

    expect(snapshot.total).toBe(1);
    expect(snapshot.reservations[0]).toMatchObject({
      unoNumber: "UNO-9988",
      pmsNumber: "PMS-7788",
      phone: "0555555555",
    });
    expect(snapshot.quality?.duplicateReservations).toBe(1);
  });

  it("counts Modified with active confirmed reservations in legacy UNO filtering", () => {
    const confirmed = normalizeReservation({ reservationNo: "1", resStatus: "M", reservationDate: "2026-08-17" });
    const modified = normalizeReservation({ reservationNo: "2", resStatus: "Modified", reservationDate: "2026-08-17" });
    const cancelled = normalizeReservation({ reservationNo: "3", resStatus: "NS", reservationDate: "2026-08-17" });
    expect(filterReservationsForReport([confirmed, modified, cancelled], {
      dateType: "booking",
      from: "2026-08-01",
      to: "2026-08-31",
      property: "all",
      status: "confirmed",
    }).map((item) => item.unoNumber)).toEqual(["1", "2"]);
  });

  it("turns the authenticated reservation response into the employee productivity report", () => {
    const reservation = normalizeReservation({
      reservationNo: "421821993",
      reservationDate: "2026-08-07T20:31:00Z",
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
      createdBy: "Hisham Almutairi",
      firstName: "Guest",
      lastName: "One",
      name: "Braira Olaya",
      resStatus: 1,
    });
    expect(filterReservationsForReport([reservation], {
      dateType: "booking",
      from: "2026-08-01",
      to: "2026-08-08",
      property: "all",
      status: "confirmed",
    })).toEqual([reservation]);
    expect(reservationToBookingRecord(reservation)).toMatchObject({
      "Agent Name": "Hisham Almutairi",
      "Resv. no.": "421821993",
      "Booking Status": "Confirmed",
    });
  });
});
