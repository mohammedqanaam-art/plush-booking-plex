import { createSign } from "node:crypto";
import type { BranchRecord } from "../../../src/data/knowledge";
import { HOTEL_INFORMATION_SHEET_URL, HOTEL_INFORMATION_SNAPSHOT_DATE } from "../../../src/data/sheetOperationalData";
import { normalizeKnowledgeText, type KnowledgeSyncStatus } from "../../../src/lib/knowledgeTypes";

const SHEET_ID = "1XBh9n7OuFLi88QcoSAFGRbDbN1DNxP_F1wNXCZpO15A";
export const knowledgeTabs = [
  { key: "facilities", title: "hotels data", gid: 966794486, range: "A1:O55", header: "الفروع" },
  { key: "meals", title: "معلومات الوجبات بريرا", gid: 1886079416, range: "A1:D15", header: "فروع بريرا" },
  { key: "halls", title: "ارقام القاعات", gid: 272896145, range: "A1:E15", header: "اسم الفرع" },
  { key: "contacts", title: "أرقام الفنادق", gid: 2119886361, range: "A15:K54", header: "Braira Riyadh" },
] as const;
type Tab = typeof knowledgeTabs[number];
type TabResult = { key: Tab["key"]; rows: string[][]; fetchedAt: string; url: string };

export function parseSheetCsv(text: string): string[][] {
  if (text.length > 500_000 || /^\s*</.test(text)) throw new Error("INVALID_SHEET_RESPONSE");
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(field.trim()); field = ""; }
    else if (!quoted && char === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("INVALID_SHEET_CSV");
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

async function googleToken(): Promise<string | null> {
  const raw = typeof Netlify === "undefined" ? "" : Netlify.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  const account = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!account.client_email || !account.private_key) throw new Error("INVALID_SHEETS_ACCOUNT");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(token).sign(account.private_key).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", redirect: "error",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(4_000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${token}.${signature}` }) });
  if (!response.ok) throw new Error("SHEETS_AUTH_FAILED");
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error("SHEETS_AUTH_FAILED");
  return result.access_token;
}

export async function readKnowledgeTab(tab: Tab, accessToken: string | null): Promise<TabResult> {
  const a1 = `'${tab.title.replace(/'/g, "''")}'!${tab.range}`;
  const url = accessToken
    ? `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(a1)}?valueRenderOption=FORMATTED_VALUE`
    : `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${tab.gid}&range=${tab.range}`;
  const response = await fetch(url, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : { Accept: "text/csv" },
    redirect: "error", signal: AbortSignal.timeout(5_000) });
  if (!response.ok || Number(response.headers.get("content-length") || 0) > 500_000) throw new Error("SHEET_UNAVAILABLE");
  const text = await response.text();
  if (text.length > 500_000) throw new Error("SHEET_TOO_LARGE");
  const rows: string[][] = accessToken ? (JSON.parse(text).values || []).map((row: unknown[]) => row.map((value) => String(value ?? ""))) : parseSheetCsv(text);
  if (!rows.slice(0, 3).flat().some((cell) => normalizeKnowledgeText(cell) === normalizeKnowledgeText(tab.header))) throw new Error("SHEET_LAYOUT_CHANGED");
  if (rows.some((row) => row.some((value) => /^#(?:ERROR|REF|VALUE|N\/A|DIV\/0|NAME|NUM)/i.test(value)))) throw new Error("SHEET_CELL_ERROR");
  return { key: tab.key, rows, fetchedAt: new Date().toISOString(), url: `${HOTEL_INFORMATION_SHEET_URL}#gid=${tab.gid}&range=${tab.range}` };
}

const aliases: Record<string, string> = {
  "barirra hattin": "بريرا حطين", "barirra yarmouk": "بريرا اليرموك", "barirra olaya": "بريرا العليا", "barirra qurtbah": "بريرا قرطبة",
  "barirra nakheel": "بريرا النخيل", "barirra wizarat": "بريرا الوزارات", "barirra damam": "بريرا الدمام", "barirra azizyah": "بريرا العزيزية",
  "barirra ahsaa": "بريرا الأحساء", "barirra hafr albateen": "بريرا حفر الباطن", "braira hafar al batin": "بريرا حفر الباطن", "braira jazan": "بريرا جازان", "braira abha": "بريرا أبها",
  "braira alrass": "بريرا الرس", "aber almunssia": "عابر المونسية", "narcissus the royal": "نارسيس رويال", "narcissus al hamra": "نارسيس الحمراء",
};
for (const [key, value] of Object.entries({"Braira Olaya": "بريرا العليا", "Braira Qurtubah": "بريرا قرطبة", "Braira Al Nakheel": "بريرا النخيل", "Braira Al Wezarat": "بريرا الوزارات", "Braira Al Rawdah": "بريرا الروضة", "Braira Al Yarmouk": "بريرا اليرموك", "Braira Hettin Resort": "بريرا حطين", "Braira Al Dammam": "بريرا الدمام", "Braira Al Azizya(يمنع التحويل)": "بريرا العزيزية", "Braira AlAhsa": "بريرا الأحساء", "Braira AlRass Hotel": "بريرا الرس", "Braira Abha Hotel": "بريرا أبها", "Aber Al Yasmin": "عابر الياسمين", "Aber Al Sahafa": "عابر الصحافة", "Aber Al Munsiyah": "عابر المونسية", "Aber Al Takhsussi": "عابر التخصصي", "Aber City Center Hotel": "عابر سيتي سنتر", "Aber Uniza": "عابر عنيزة", "Aber Abha": "عابر أبها", "Aber Khamis Mushait": "عابر خميس مشيط", "Aber Bni Amroo": "عابر بني عمرو", "Aber Bani Amrro": "عابر بني عمرو", "Boudl Mounsiya": "بودل المونسية", "Boudl Olaya": "بودل العليا", "Boudl Sahafa": "بودل الصحافة", "Boudl Al Sulaimaniyah": "بودل السليمانية", "Boudl Al Wadi": "بودل الوادي", "Boudl Wourood": "بودل الورود", "Boudl Masif": "بودل المصيف", "Boudl Gaber": "بودل جابر", "Boudl Fayha": "بودل الفيحاء", "Boudl Malaz": "بودل الملز", "Boudl Qasr": "بودل القصر", "Boudl Wadi Al Dawasir": "بودل وادي الدواسر", "Boudl Majmaa": "بودل المجمعة", "Boudl Tahlia": "بودل التحلية", "Boudl Quraish": "بودل قريش", "Boudl Makkah Ajiad": "بودل مكة أجياد", "Boudl Taif": "بودل الطائف", "Boudl Shataa": "بودل الشاطئ", "Boudl Gardenia": "بودل جاردينيا", "Boudl Al Jubail": "بودل الجبيل", "Boudl Al Cornish": "بودل الكورنيش", "Boudl Maydan": "بودل الميدان", "Boudl Nakhil": "بودل النخيل", "Boudl Fakhreyah": "بودل الفاخرية", "Boudl Buraydah": "بودل بريدة", "Boudl Rawdah Breda": "بودل الروضة", "Boudl Rass": "بودل الرس", "Boudl Abha": "بودل أبها", "Boudl Khamis Mushait": "بودل خميس مشيط", "Boudl Mahayel Asir": "بودل محايل عسير", "Boudl Salmia": "بودل السالمية", "Boudl Fahahil": "بودل الفحيحيل", "Narcissus Riyadh": "نارس الرياض", "Narcissus Obhur": "نارسيس أبحر"})) aliases[normalizeKnowledgeText(key)] = value;
const branchKey = (value: string) => normalizeKnowledgeText(aliases[normalizeKnowledgeText(value)] || value)
  .replace(/^نارسس /, "نارسيس ").replace(/^نارسيس ذا رويال$/, "نارسيس رويال").replace(/^نارسيس الحمرا$/, "نارسيس الحمراء");

export function applyLiveKnowledge(records: BranchRecord[], tabs: TabResult[]) {
  const byKey = new Map(tabs.map((tab) => [tab.key, tab]));
  return records.map((original) => {
    const row = { ...original, sourceFiles: [...original.sourceFiles], hallPackages: [...original.hallPackages] };
    const find = (key: Tab["key"], column: number) => byKey.get(key)?.rows.find((cells) => branchKey(cells[column] || "") === branchKey(row.branch));
    const facilities = find("facilities", 0);
    if (facilities) {
      const mapping = { breakfastInfo: 1, poolInfo: 2, coffeeShopInfo: 3, restaurantInfo: 4, balconyInfo: 5, parkingInfo: 6,
        gymInfo: 9, laundryInfo: 10, outdoorSeatingInfo: 11, spaInfo: 12, jacuzziInfo: 13, kidsSectionInfo: 14 } as const;
      for (const [field, index] of Object.entries(mapping)) (row as unknown as Record<string, unknown>)[field] = facilities[index] || "غير محدد في الشيت";
      row.hallPackages = [facilities[7] || "غير محدد في الشيت", facilities[8] || "غير محدد في الشيت"];
    }
    const meals = find("meals", 0);
    if (meals) {
      row.breakfastInfo = meals[1] || "غير محدد في الشيت";
      row.lunchInfo = meals[2] || "غير محدد في الشيت"; row.dinnerInfo = meals[3] || "غير محدد في الشيت";
      const hours = byKey.get("meals")?.rows.find((cells) => normalizeKnowledgeText(cells[0] || "") === "الاوقات");
      if (hours) { row.breakfastInfo += ` · الوقت العام في الشيت: ${hours[1] || "غير محدد"}`; row.lunchInfo += ` · ${hours[2] || ""}`; row.dinnerInfo += ` · ${hours[3] || ""}`; }
      if (facilities?.[1]) row.breakfastInfo += `\nمواعيد سجل الفرع: ${facilities[1]}\nعند اختلاف المواعيد يرجى التحقق من الفرع.`;
    }
    const halls = find("halls", 3); if (halls) row.hallPhone = halls[4] || "غير محدد في الشيت";
    const contacts = byKey.get("contacts")?.rows.flatMap((cells) => [0, 3, 6, 9].map((column) => ({ name: cells[column] || "", phone: cells[column + 1] || "" })))
      .find((item) => branchKey(item.name) === branchKey(row.branch));
    if (contacts) { row.receptionPhone = contacts.phone || "غير محدد في الشيت"; row.hotelPhone = row.receptionPhone; }
    const used = [contacts ? byKey.get("contacts") : null, facilities ? byKey.get("facilities") : null, meals ? byKey.get("meals") : null, halls ? byKey.get("halls") : null].filter((item): item is TabResult => Boolean(item));
    if (used.length) row.sourceFiles = [...used.map((item) => item.url), ...row.sourceFiles];
    row.notes = "بيانات وصفية للفرع؛ لا تمثل إتاحة حية أو سعر حجز مضمون. راجع مصدر كل معلومة وتأكد من الشروط قبل الوعد للضيف.";
    return row;
  });
}

let cache: { expires: number; tabs: TabResult[]; checkedAt: string } | null = null;
let pending: Promise<{ tabs: TabResult[]; checkedAt: string }> | null = null;
async function loadTabs() {
  if (cache && cache.expires > Date.now()) return cache;
  if (pending) return pending;
  pending = (async () => {
    const checkedAt = new Date().toISOString();
    const token = await googleToken();
    const results = await Promise.allSettled(knowledgeTabs.map((tab) => readKnowledgeTab(tab, token)));
    const tabs = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    cache = { expires: Date.now() + (tabs.length ? 5 * 60_000 : 30_000), tabs, checkedAt };
    return cache;
  })().finally(() => { pending = null; });
  return pending;
}

export async function getLiveKnowledge(records: BranchRecord[]) {
  const result = typeof Netlify === "undefined" ? { tabs: [], checkedAt: new Date().toISOString() } : await loadTabs().catch(() => ({ tabs: [], checkedAt: new Date().toISOString() }));
  const count = result.tabs.length;
  const sync: KnowledgeSyncStatus = { state: count === knowledgeTabs.length ? "live" : count ? "partial" : "snapshot",
    checkedAt: result.checkedAt, snapshotDate: HOTEL_INFORMATION_SNAPSHOT_DATE,
    message: count === knowledgeTabs.length ? "تمت قراءة الشيت؛ تُحدّث القراءة كل خمس دقائق." : count ? "تحديث جزئي؛ المصادر غير المتاحة تعرض النسخة المحفوظة وتحتاج التحقق." : "تعذر التحقق من الشيت الآن؛ المعروض نسخة محفوظة تحتاج التحقق قبل التأكيد.",
    tabs: knowledgeTabs.map((tab) => { const value = result.tabs.find((item) => item.key === tab.key); return { title: tab.title, url: `${HOTEL_INFORMATION_SHEET_URL}#gid=${tab.gid}`, fetchedAt: value?.fetchedAt || null, available: Boolean(value) }; }),
  };
  return { branchRecords: applyLiveKnowledge(records, result.tabs), sync };
}
