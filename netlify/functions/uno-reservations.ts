import type { Config } from "@netlify/functions";
import { json, validateSession } from "./_shared/security";
import { getEnvironmentStore } from "./_shared/storage";
import {
  riyadhDateKey,
  summarizeUnoReservations,
  unoStatusGroup,
  type UnoReportSummary,
  type UnoReservationRecord,
} from "./_shared/unoReportCore";

type UnoSnapshot = {
  reservations?: UnoReservationRecord[];
  total?: number;
  syncedAt?: string;
  source?: "automatic" | "manual";
  sourceSystem?: "UNO";
  sessionExpiresAt?: string;
  summary?: UnoReportSummary;
  quality?: Record<string, unknown>;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalized = (value: string) => value.toLocaleLowerCase("ar").replace(/[\s\-()]/g, "");
const digits = (value: string) => value.replace(/\D/g, "");

const statusGroup = (value: string) => {
  const group = unoStatusGroup(value);
  return group === "modified" ? "confirmed" : group;
};

const queryMatches = (reservation: UnoReservationRecord, field: string, query: string) => {
  if (!query) return true;
  if (field === "phone") {
    const expected = digits(query);
    const actual = digits(reservation.phone);
    return Boolean(expected && actual && (actual.endsWith(expected) || expected.endsWith(actual)));
  }
  const fields = field === "uno"
    ? [reservation.unoNumber]
    : field === "pms"
      ? [reservation.pmsNumber]
      : field === "guest"
        ? [reservation.guestName]
        : [
            reservation.unoNumber,
            reservation.pmsNumber,
            reservation.phone,
            reservation.guestName,
            reservation.agentName,
            reservation.property,
            reservation.city,
            reservation.status,
          ];
  const expected = normalized(query);
  return fields.some((value) => normalized(value || "").includes(expected));
};

export default async (req: Request) => {
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (!["superadmin", "admin"].includes(session.role)) return json({ error: "Permission Denied" }, 403);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const field = text(url.searchParams.get("field")) || "all";
  const query = text(url.searchParams.get("q"));
  const property = text(url.searchParams.get("property"));
  const status = text(url.searchParams.get("status"));
  const dateField = text(url.searchParams.get("dateField")) || "booking";
  const from = text(url.searchParams.get("from"));
  const to = text(url.searchParams.get("to"));
  const requestedLimit = Number(url.searchParams.get("limit") || 5000);
  const requestedOffset = Number(url.searchParams.get("offset") || 0);
  const offset = Math.max(0, Number.isFinite(requestedOffset) ? Math.trunc(requestedOffset) : 0);

  if (!["all", "phone", "pms", "uno", "guest"].includes(field)) return json({ error: "Invalid search field" }, 400);
  if (!["", "all", "confirmed", "cancelled", "other"].includes(status)) return json({ error: "Invalid status" }, 400);
  if (!["booking", "checkin", "checkout"].includes(dateField)) return json({ error: "Invalid date field" }, 400);
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    return json({ error: "Invalid date range" }, 400);
  }

  const unfilteredWholeSnapshot = !query
    && (!property || property === "all")
    && (!status || status === "all")
    && !from
    && !to
    && offset === 0;
  const normalizedRequestedLimit = Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 5000;
  // The admin UI historically requested 5,000 rows, which silently clipped larger monthly UNO reports.
  // A whole-snapshot request now returns the complete reconciled month (up to the protected 50k ceiling).
  const limit = unfilteredWholeSnapshot && normalizedRequestedLimit >= 5000
    ? 50_000
    : Math.min(50_000, Math.max(1, normalizedRequestedLimit));

  const store = getEnvironmentStore("uno-reservations", { consistency: "strong" });
  const snapshot = ((await store.get("latest", { type: "json" }).catch(() => null)) || {}) as UnoSnapshot;
  const reservations = Array.isArray(snapshot.reservations) ? snapshot.reservations : [];

  const filtered = reservations.filter((reservation) => {
    if (property && property !== "all" && reservation.property !== property) return false;
    if (status && status !== "all" && statusGroup(reservation.status) !== status) return false;
    if (!queryMatches(reservation, field, query)) return false;

    const value = riyadhDateKey(
      dateField === "checkin"
        ? reservation.checkIn
        : dateField === "checkout"
          ? reservation.checkOut
          : reservation.bookingDate,
    );
    if (from && (!value || value < from)) return false;
    if (to && (!value || value > to)) return false;
    return true;
  });

  const properties = Array.from(new Set(reservations.map((reservation) => reservation.property).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "ar"));
  const detailedSummary = summarizeUnoReservations(filtered);
  const summary = {
    ...detailedSummary,
    // Preserve the legacy shape while counting Modified as an active confirmed reservation.
    confirmed: detailedSummary.confirmed,
    cancelled: detailedSummary.cancelled,
    other: detailedSummary.other,
  };

  return json({
    reservations: filtered.slice(offset, offset + limit),
    total: filtered.length,
    offset,
    limit,
    syncedAt: snapshot.syncedAt || null,
    source: snapshot.source || null,
    sourceSystem: "UNO",
    sessionExpiresAt: snapshot.sessionExpiresAt || null,
    properties,
    summary,
    quality: snapshot.quality || null,
    snapshotSummary: snapshot.summary || null,
  });
};

export const config: Config = {
  path: "/api/admin/uno-reservations",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
  },
};
