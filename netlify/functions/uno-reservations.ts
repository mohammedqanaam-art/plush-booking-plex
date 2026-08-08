import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { json, validateSession } from "./_shared/security";

type UnoReservation = {
  unoNumber: string;
  pmsNumber: string;
  phone: string;
  guestName: string;
  property: string;
  status: string;
  checkIn: string;
  checkOut: string;
  bookingDate: string;
  channel: string;
  amount: string;
  currency: string;
};

type UnoSnapshot = {
  reservations?: UnoReservation[];
  total?: number;
  syncedAt?: string;
  source?: "automatic" | "manual";
  sessionExpiresAt?: string;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalized = (value: string) => value.toLocaleLowerCase("ar").replace(/[\s\-()]/g, "");
const digits = (value: string) => value.replace(/\D/g, "");

const statusGroup = (value: string) => {
  const candidate = value.trim().toLocaleLowerCase("en");
  if (["c", "ns"].includes(candidate) || /cancel|no[\s-]?show|ملغ|عدم حضور/.test(candidate)) return "cancelled";
  if (["m", "o", "n", "i"].includes(candidate) || /confirm|مؤكد/.test(candidate)) return "confirmed";
  return "other";
};

const dateKey = (value: string) => {
  if (!value) return "";
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (iso) return iso;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

const queryMatches = (reservation: UnoReservation, field: string, query: string) => {
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
            reservation.property,
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
  const requestedLimit = Number(url.searchParams.get("limit") || 1000);
  const requestedOffset = Number(url.searchParams.get("offset") || 0);
  const limit = Math.min(5000, Math.max(1, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 1000));
  const offset = Math.max(0, Number.isFinite(requestedOffset) ? Math.trunc(requestedOffset) : 0);

  if (!["all", "phone", "pms", "uno", "guest"].includes(field)) return json({ error: "Invalid search field" }, 400);
  if (!["", "all", "confirmed", "cancelled", "other"].includes(status)) return json({ error: "Invalid status" }, 400);
  if (!["booking", "checkin", "checkout"].includes(dateField)) return json({ error: "Invalid date field" }, 400);
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    return json({ error: "Invalid date range" }, 400);
  }

  const store = getStore({ name: "uno-reservations", consistency: "strong" });
  const snapshot = ((await store.get("latest", { type: "json" }).catch(() => null)) || {}) as UnoSnapshot;
  const reservations = Array.isArray(snapshot.reservations) ? snapshot.reservations : [];

  const filtered = reservations.filter((reservation) => {
    if (property && property !== "all" && reservation.property !== property) return false;
    if (status && status !== "all" && statusGroup(reservation.status) !== status) return false;
    if (!queryMatches(reservation, field, query)) return false;

    const value = dateKey(
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
  const summary = filtered.reduce((result, reservation) => {
    const group = statusGroup(reservation.status);
    result.total += 1;
    if (group === "confirmed") result.confirmed += 1;
    else if (group === "cancelled") result.cancelled += 1;
    else result.other += 1;
    return result;
  }, { total: 0, confirmed: 0, cancelled: 0, other: 0 });

  return json({
    reservations: filtered.slice(offset, offset + limit),
    total: filtered.length,
    offset,
    limit,
    syncedAt: snapshot.syncedAt || null,
    source: snapshot.source || null,
    sessionExpiresAt: snapshot.sessionExpiresAt || null,
    properties,
    summary,
  });
};

export const config: Config = {
  path: "/api/admin/uno-reservations",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
  },
};
