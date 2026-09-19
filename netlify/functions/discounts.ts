import { json, validateSession } from "./_shared/security";
import { getEnvironmentStore } from "./_shared/storage";

type Discount = {
  id: string;
  brand: "Boudl" | "Braira" | "Narcissus" | "Aber";
  title: string;
  percentage: number;
  active: boolean;
  startsAt?: string;
  endsAt?: string;
  notes?: string;
  createdAt: string;
};

const BRANDS: Discount["brand"][] = ["Boudl", "Braira", "Narcissus", "Aber"];
const clean = (value: unknown, maxLength: number) => String(value || "").trim().slice(0, maxLength);
const percentage = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
};
const date = (value: unknown) => {
  const candidate = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : undefined;
};

export default async (req: Request) => {
  const store = getEnvironmentStore("discounts", { consistency: "strong" });
  const items = ((await store.get("items", { type: "json" })) as Discount[] | null) || [];

  if (req.method === "GET") {
    return json({ discounts: items });
  }

  const session = await validateSession(req);
  if (!session || !["superadmin", "admin", "editor"].includes(session.role)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as Partial<Discount>;
    const brand = BRANDS.includes(body.brand as Discount["brand"]) ? body.brand as Discount["brand"] : "Boudl";
    const title = clean(body.title, 160);
    if (!title) return json({ error: "Discount title is required" }, 400);
    const discount: Discount = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      brand,
      title,
      percentage: percentage(body.percentage),
      active: body.active !== false,
      startsAt: date(body.startsAt),
      endsAt: date(body.endsAt),
      notes: clean(body.notes, 1_000),
      createdAt: new Date().toISOString(),
    };
    items.unshift(discount);
    await store.setJSON("items", items);
    return json({ discount }, 201);
  }

  if (req.method === "PUT") {
    const body = (await req.json().catch(() => ({}))) as Partial<Discount>;
    const id = String(body.id || "");
    const index = items.findIndex((d) => d.id === id);
    if (index === -1) return json({ error: "Not found" }, 404);
    items[index] = {
      ...items[index],
      brand: body.brand && BRANDS.includes(body.brand) ? body.brand : items[index].brand,
      title: body.title !== undefined ? clean(body.title, 160) : items[index].title,
      percentage: body.percentage !== undefined ? percentage(body.percentage) : items[index].percentage,
      active: body.active !== undefined ? Boolean(body.active) : items[index].active,
      startsAt: body.startsAt !== undefined ? date(body.startsAt) : items[index].startsAt,
      endsAt: body.endsAt !== undefined ? date(body.endsAt) : items[index].endsAt,
      notes: body.notes !== undefined ? clean(body.notes, 1_000) : items[index].notes,
      id: items[index].id,
    };
    await store.setJSON("items", items);
    return json({ discount: items[index] });
  }

  if (req.method === "DELETE") {
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    const id = String(body.id || "");
    await store.setJSON(
      "items",
      items.filter((d) => d.id !== id),
    );
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};
