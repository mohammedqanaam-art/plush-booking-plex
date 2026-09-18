import snapshot from "./hotelWorkbookSnapshot.json";
import { publicBranchContacts } from "./publicBranchContacts";
import type { BranchRecord, BrandKey } from "./knowledge";
import type { HotelWorkbookDetails } from "../lib/hotelWorkbook";
import { HOTEL_INFORMATION_SNAPSHOT_DATE } from "./sheetOperationalData";

type WorkbookRow = {
  id: string; name: string; city: string; brand: BrandKey; region: string;
  fields: Partial<BranchRecord>; workbook: HotelWorkbookDetails;
};
export const hotelWorkbookRows = snapshot as WorkbookRow[];
export const HOTEL_WORKBOOK_IMPORTED_ON = "2026-09-18";

function emptyBranch(row: WorkbookRow): BranchRecord {
  return {
    id: row.id, brand: row.brand, branch: row.name, city: row.city, region: row.region, overview: `${row.name} — ${row.city}`,
    receptionPhone: "", hotelPhone: "", salesPhone: "", hallPhone: "", whatsappNumber: "", managerName: "", managerPhone: "", managerEmail: "",
    breakfastInfo: "", lunchInfo: "", dinnerInfo: "", poolInfo: "", poolHours: "", coffeeShopInfo: "", restaurantInfo: "", restaurantHours: "",
    balconyInfo: "", parkingInfo: "", kidsSectionInfo: "", jacuzziInfo: "", bathtubInfo: "", spaInfo: "", spaHours: "", laundryInfo: "",
    outdoorSeatingInfo: "", gymInfo: "", gymHours: "", roomTypes: [], roomDetails: [], roomSource: "unverified", hallPackages: [],
    notes: "", attachments: [], sourceFiles: [], visibility: "public", priority: 500,
  };
}

export function enrichWithHotelWorkbook(records: BranchRecord[]): BranchRecord[] {
  const result = new Map(records.map(row => [row.id, row]));
  for (const data of hotelWorkbookRows) {
    const previous = result.get(data.id) || emptyBranch(data);
    const reception = publicBranchContacts[data.id]?.phone || "";
    const fields = { ...data.fields };
    const supplement = (latest: string, old: string) => {
      const simple = /^(?:غير متوفر|غير محدد|غير مسجل|لا\s?يوجد|متوفر|يوجد|حسب نوع الغرفة)$/;
      if (!old || simple.test(old.trim()) || /^(?:غير متوفر|لا\s?يوجد)/.test(latest) || old === latest || old.length < 12) return latest;
      return `${latest || "غير مسجل في الشيت الجديد"}\nتفاصيل من الدليل السابق (${HOTEL_INFORMATION_SNAPSHOT_DATE}، تحتاج تأكيدًا): ${old}`;
    };
    // Retain useful legacy details with their own date; never silently relabel old prices as new.
    if (!previous.workbook) {
      const serviceFields = ["breakfastInfo", "poolInfo", "coffeeShopInfo", "restaurantInfo", "balconyInfo", "parkingInfo", "kidsSectionInfo", "jacuzziInfo", "spaInfo", "laundryInfo", "outdoorSeatingInfo", "gymInfo"] as const;
      for (const key of serviceFields) fields[key] = supplement(String(fields[key] || ""), previous[key]);
      const halls = [...(fields.hallPackages || [])];
      if (halls[0]?.includes(": متوفر")) halls[0] = supplement(halls[0], previous.hallPackages[0] || "");
      halls[1] = supplement(halls[1] || "", previous.hallPackages[1] || "");
      fields.hallPackages = halls;
    }
    result.set(data.id, {
      ...previous, ...fields,
      id: data.id, brand: data.brand, branch: data.name, city: data.city, region: data.region,
      // These are reception contacts, never manager or sales cells from the workbook.
      receptionPhone: reception, hotelPhone: reception,
      workbook: data.workbook,
      sourceFiles: [...new Set([data.workbook.sourceName, ...previous.sourceFiles])],
    });
  }
  return [...result.values()];
}
