import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createReservationSearchPayload,
  isTrustedRateGainUrl,
  normalizeReservation,
} from "../../netlify/functions/uno-connection";

describe("UNO integration boundary", () => {
  it("allows only approved HTTPS UNO endpoints", () => {
    expect(isTrustedRateGainUrl("https://unolive.rategain.com/")).toBe(true);
    expect(isTrustedRateGainUrl("https://api.rategain.com/uno")).toBe(true);
    expect(isTrustedRateGainUrl("https://uno-prod-ui-api-1087875874170.us-central1.run.app/api/")).toBe(true);
    expect(isTrustedRateGainUrl("http://unolive.rategain.com/")).toBe(false);
    expect(isTrustedRateGainUrl("https://rategain.com.attacker.example/")).toBe(false);
    expect(isTrustedRateGainUrl("https://fake-uno-api.us-central1.run.app/api/")).toBe(false);
    expect(isTrustedRateGainUrl("https://example.com/")).toBe(false);
  });

  it("keeps UNO credentials and sessions server-side", () => {
    const root = process.cwd();
    const page = fs.readFileSync(path.join(root, "src/pages/AdminUno.tsx"), "utf8");
    const fn = fs.readFileSync(path.join(root, "netlify/functions/uno-connection.ts"), "utf8");
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
    expect(page).toContain("api.listUnoReservations()");
    expect(page).toContain('autoComplete="one-time-code"');
  });

  it("builds a property-scoped reservation lookup", () => {
    const payload = createReservationSearchPayload({
      chainId: "4",
      properties: [
        { id: "11", name: "One" },
        { id: "12", name: "Two" },
      ],
    }, "pms", "PMS-9988");

    expect(payload.chainID).toBe("4");
    expect(payload.propertyId).toBe("11,12");
    expect(payload.pmsConfirmationNo).toBe("PMS-9988");
    expect(payload.phoneNo).toBe("");
  });

  it("builds a property-scoped list request without a search value", () => {
    const payload = createReservationSearchPayload({
      chainId: "4",
      properties: [{ id: "11", name: "One" }],
    });

    expect(payload.chainID).toBe("4");
    expect(payload.propertyId).toBe("11");
    expect(payload.reservationNo).toBe("");
    expect(payload.pmsConfirmationNo).toBe("");
    expect(payload.phoneNo).toBe("");
  });

  it("normalizes UNO reservation fields without exposing the raw response", () => {
    expect(normalizeReservation({
      reservationNo: "UNO-123",
      pmsid: "PMS-456",
      phoneNo: "0501234567",
      firstName: "Mohammed",
      lastName: "Qanaam",
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
      property: "Hotel",
      status: "مؤكد",
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      bookingDate: "",
      channel: "",
      amount: "700",
      currency: "SAR",
    });
  });
});
