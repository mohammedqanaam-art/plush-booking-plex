import { rooms } from "./data";

export function parseAmount(value: string) {
  const ascii = value.trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/٫/g, ".").replace(/٬/g, ",");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(ascii)) return NaN;
  return Number(ascii.replace(/,/g, ""));
}
export function filterRooms(group: string, adults: string, feature: string, order: string) {
  const features: Record<string, string[]> = { pool: ["pool-villa"], jacuzzi: ["vip", "executive", "presidential", "royal"], accessible: ["accessible"], kitchen: ["villa", "pool-villa"], twin: ["twin", "royal", "villa", "pool-villa"] };
  const selected = rooms.filter(r => (group === "الكل" || r.group === group) && (!adults || r.adults >= Number(adults)) && (!feature || features[feature]?.includes(r.id)));
  return order === "area" ? [...selected].sort((a, b) => Number(a.area) - Number(b.area)) : selected;
}

