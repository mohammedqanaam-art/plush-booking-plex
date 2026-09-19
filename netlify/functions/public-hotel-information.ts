import type { Config } from "@netlify/functions";
import type { BranchRecord } from "../../src/data/knowledge";
import { publicBranches } from "../../src/data/publicBranches";
import { publicBranchContacts } from "../../src/data/publicBranchContacts";
import { json } from "./_shared/security";
import { publicWorkbookDetails } from "../../src/lib/hotelWorkbook";

const guestFields = ["region", "overview", "breakfastInfo", "lunchInfo", "dinnerInfo", "poolInfo", "poolHours", "coffeeShopInfo", "restaurantInfo", "restaurantHours", "balconyInfo", "parkingInfo", "kidsSectionInfo", "jacuzziInfo", "bathtubInfo", "spaInfo", "spaHours", "laundryInfo", "outdoorSeatingInfo", "gymInfo", "gymHours"] as const;
// Construct a new object: never serialize operational records or their future fields.
export function publicHotelRecords(records: BranchRecord[]): BranchRecord[] {
  return publicBranches.map<BranchRecord>(identity => {
    const record = records.find(row => row.id === identity.id);
    const details = Object.fromEntries(guestFields.map(key => [key, record?.[key] || ""])) as Pick<BranchRecord, typeof guestFields[number]>;
    return {
      ...details, id: identity.id, branch: identity.name, brand: identity.brandCode as BranchRecord["brand"], city: identity.city,
      receptionPhone: publicBranchContacts[identity.id]?.phone || "",
      roomTypes: record?.roomTypes.map(value => String(value)) || [],
      roomDetails: record?.roomDetails?.map(room => ({ type: room.type, area: room.area, description: room.description })) || [],
      roomSource: record?.roomSource || "unverified",
      hallPackages: record?.hallPackages.map(value => String(value)) || [],
      workbook: publicWorkbookDetails(record?.workbook),
      // Blank compatibility fields are never populated from private records.
      hotelPhone: "", salesPhone: "", hallPhone: "", whatsappNumber: "", managerName: "", managerPhone: "", managerEmail: "",
      notes: "", attachments: [], sourceFiles: [], visibility: "public", priority: 0,
    };
  });
}

export default async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const { branchRecords } = await import("../../src/data/knowledge");
    return json({ branches: [], branchRecords: publicHotelRecords(branchRecords), knowledgeEntries: [] });
  } catch {
    return json({ error: "تعذر تحميل معلومات الفنادق" }, 503);
  }
};
export const config: Config = { path: "/api/hotels/information" };
