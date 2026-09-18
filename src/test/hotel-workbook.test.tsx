import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { branchRecords } from "@/data/knowledge";
import { hotelWorkbookRows } from "@/data/hotelWorkbook";
import { publicBranches } from "@/data/publicBranches";
import { publicBranchContacts } from "@/data/publicBranchContacts";
import { publicHotelRecords } from "../../netlify/functions/public-hotel-information";
import { applyLiveKnowledge } from "../../netlify/functions/_shared/liveKnowledge";
import { buildKnowledgeEntries } from "@/data/operations";
import { buildBranchKnowledge } from "../../netlify/functions/_shared/employeeKnowledge";
import { HotelInformationContent } from "@/pages/HotelInformation";
import { KnowledgeContext } from "@/hooks/useInternalKnowledge";

afterEach(cleanup);
const get = (id: string) => branchRecords.find(row => row.id === id)!;
describe("September workbook enrichment", () => {
  it("maps all 60 source rows once and retains stable public IDs", () => {
    expect(hotelWorkbookRows).toHaveLength(60);
    expect(new Set(hotelWorkbookRows.map(row => row.id)).size).toBe(60);
    expect(hotelWorkbookRows.map(row => row.workbook.references[0].rows[0])).toEqual(Array.from({ length: 60 }, (_, i) => i + 2));
    expect(publicBranches).toHaveLength(60);
    expect(publicBranches.map(row => row.id).sort()).toEqual(branchRecords.map(row => row.id).sort());
    expect(get("boudl-moaz").branch).toBe("بودل المصيف");
    expect(get("boudl-maydan").city).toBe("حفر الباطن");
    expect(get("aber-city-center").city).toBe("حفر الباطن");
    expect(get("braira-aziziya").city).toBe("الخبر");
    expect(get("braira-jubail").brand).toBe("Braira");
    expect(get("zamn-riyadh").brand).toBe("Z'MN");
    expect(publicBranchContacts["boudl-salmia"].phone).toBe("+96525757999");
  });
  it("preserves continuation rows and excludes ambiguous location names", () => {
    expect(get("boudl-quraish").workbook?.connectingRoomTypes).toHaveLength(2);
    expect(get("braira-rass").workbook?.connectingRoomTypes).toHaveLength(2);
    expect(get("braira-olaya").overview).toContain("Panorama Mall");
    expect(get("braira-olaya").workbook?.facts.address).toContain("شارع العليا");
    expect(get("aber-uniza").overview.split("مطار الأمير نايف")).toHaveLength(2);
    expect(hotelWorkbookRows.some(row => row.workbook.references.some(ref => ref.sheet === "وصف الفنادق والمعالم الأقرب" && ref.rows.includes(74)))).toBe(false);
  });
  it("keeps missing facts unknown and flags disagreements instead of guessing", () => {
    expect(get("braira-hettin").workbook?.facts.checkIn).toBe("");
    expect(get("braira-hettin").poolInfo).toBe("");
    expect(get("braira-wezarat").workbook?.facts.connectingRooms).toContain("متعارض");
    expect(get("braira-yarmouk").workbook?.warnings.join(" ")).toContain("الغرف المتصلة");
    expect(get("braira-ahsa").workbook?.warnings.join(" ")).toContain("صباحًا أو مساءً");
    expect(publicBranchContacts["boudl-jubail"].phone).toBe("+966133454111");
    expect(publicBranchContacts["boudl-jubail"].additionalPhones).toContain("+966133454930");
  });
  it("does not allow the separate legacy feed to overwrite the uploaded snapshot", () => {
    const original = get("braira-nakheel");
    const [next] = applyLiveKnowledge([original], [
      { key: "facilities", fetchedAt: "now", url: "https://example.com", rows: [["بريرا النخيل", "old breakfast", "old pool"]] },
      { key: "meals", fetchedAt: "now", url: "https://example.com", rows: [["بريرا النخيل", "old breakfast", "new lunch", "new dinner"]] },
    ]);
    expect(next.breakfastInfo).toBe(original.breakfastInfo);
    expect(next.poolInfo).toBe(original.poolInfo);
    expect(next.lunchInfo).toBe("new lunch");
    expect(next.workbook).toEqual(original.workbook);
  });
  it("serializes only allowlisted workbook properties including nested objects", () => {
    const original = get("braira-qurtubah");
    const secret = "PRIVATE_NEW_FIELD_SENTINEL";
    const malicious = { ...original, workbook: { ...original.workbook!, manager: secret, facts: { ...original.workbook!.facts, managerPhone: secret }, references: original.workbook!.references.map(ref => ({ ...ref, token: secret })) } };
    const publicData = publicHotelRecords([malicious]);
    expect(JSON.stringify(publicData)).not.toContain(secret);
    expect(publicData.find(row => row.id === original.id)?.workbook?.facts.checkIn).toBe("14:00");
    for (const row of hotelWorkbookRows) {
      expect(Object.keys(row.fields).some(key => /manager|sales|hallPhone|whatsapp|notes|discount/i.test(key))).toBe(false);
      expect(Object.keys(row.workbook.facts).some(key => /manager|discount/i.test(key))).toBe(false);
    }
  });
  it("makes uploaded details searchable and available to the employee assistant", () => {
    expect(buildKnowledgeEntries([get("boudl-quraish")])[0].body).toContain("جونيور سويت +جونيور سويت");
    const answer = buildBranchKnowledge("وقت الدخول في بريرا قرطبة", branchRecords, { state: "snapshot", checkedAt: "", snapshotDate: "2026-09-18", message: "نسخة محفوظة", tabs: [] });
    expect(answer.fastReply).toContain("14:00");
    expect(answer.sources[0].title).toContain("معلومات الفنادق اخر نسخه");
    expect(answer.sources[0].url).toContain("braira-qurtubah");
  });
  it("shows the imported public details and conflict notice for the selected branch", () => {
    const records = publicHotelRecords(branchRecords);
    render(<MemoryRouter initialEntries={["/branches/information?branch=braira-yarmouk"]}><KnowledgeContext.Provider value={{ branches: [], branchRecords: records, knowledgeEntries: [] }}><HotelInformationContent publicView /></KnowledgeContext.Provider></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "بريرا اليرموك" })).toBeDefined();
    expect(screen.getByText("وقت الدخول")).toBeDefined();
    expect(screen.getByText("النقل من وإلى المطار")).toBeDefined();
    expect(screen.getByLabelText("معلومات تحتاج تأكيدًا")).toHaveTextContent("الغرف المتصلة");
    expect(screen.queryByText("مدير الفرع")).toBeNull();
    expect(screen.getByText("مصدر التفاصيل وتاريخ الاستيراد")).toBeDefined();
  });
});
