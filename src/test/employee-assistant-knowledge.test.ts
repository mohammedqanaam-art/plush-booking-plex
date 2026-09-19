import { readFileSync } from "node:fs";
import { branchRecords } from "../data/knowledge";
import type { KnowledgeSyncStatus } from "../lib/knowledgeTypes";
import { describe, expect, it } from "vitest";
import { buildEmployeeKnowledge, buildBranchKnowledge, branchForQuestion, normalizeEmployeeIntent } from "../../netlify/functions/_shared/employeeKnowledge";

describe("employee assistant knowledge", () => {
  it("uses the branch sheet price and never substitutes a general brand package", () => {
    const sync: KnowledgeSyncStatus = { state: "snapshot", checkedAt: "2026-09-07T12:00:00Z", snapshotDate: "2026-07-13", message: "نسخة محفوظة تحتاج التحقق", tabs: [] };
    const result = buildBranchKnowledge("كم بكج العرسان في بريرا النخيل؟", branchRecords, sync);
    expect(result.fastReply).toContain("850 ريال");
    expect(result.fastReply).not.toContain("649 ريال");
    expect(result.fastReply).toContain("تحتاج التحقق");
    expect(result.sources[0]?.url).toContain("docs.google.com");
    expect(result.sources[0]?.url).toContain("gid=966794486");
    const rooms = buildBranchKnowledge("مساحة غرف بريرا النخيل", branchRecords, sync);
    expect(rooms.sources[0]?.url).toBe("/knowledge-bank");
  });
  it("never picks the other brand and tolerates one-letter branch typos", () => {
    expect(branchForQuestion("بودل العليا", branchRecords)?.branch).toBe("بودل العليا");
    expect(branchForQuestion("بريرا العليا", branchRecords)?.branch).toBe("بريرا العليا");
    expect(branchForQuestion("بريره النخيلل", branchRecords)?.branch).toBe("بريرا النخيل");
    expect(branchForQuestion("العليا", branchRecords)).toBeNull();
    expect(normalizeEmployeeIntent("عندي شكواء في بريره")).toContain("شكوي في بريرا");
  });

  it("acknowledges the wedding-package intent before requesting the one blocking detail", () => {
    const result = buildEmployeeKnowledge("كم سعر بكج العرسان؟");
    expect(result.fastReply).toContain("فهمت أنك تريد سعر باقة العرسان");
    expect(result.fastReply).toContain("اكتب اسم الفرع فقط");
    expect(result.fastReply).not.toContain("؟");
  });

  it("instructs the model to correct spelling silently and avoid question lists", () => {
    const employeeAgent = readFileSync("netlify/functions/employee-agent.ts", "utf8");
    expect(employeeAgent).toContain("صحح الأخطاء الإملائية واللهجية داخليًا");
    expect(employeeAgent).toContain("لا تبدأ الرد بسؤال");
    expect(employeeAgent).toContain("معلومة واحدة محددة فقط");
  });

  it("returns the draft complaint escalation checklist for a generic question", () => {
    const result = buildEmployeeKnowledge("كيف أتعامل مع شكوى الضيف؟");
    expect(result.fastReply).toContain("تصعيد");
    expect(result.fastReply).toContain("تبقى مالك الحالة");
    expect(result.evidence).toContain("تصعيد فوري");
  });

  it("sends detailed complaint scenarios to the model with grounded evidence", () => {
    const result = buildEmployeeKnowledge("ضيف في الفرع لديه شكوى لأن حجزه المؤكد غير موجود في PMS ويطلب استردادًا فوريًا");
    expect(result.fastReply).toBeNull();
    expect(result.evidence).toContain("اختلاف UNO أو CRO مع PMS");
  });
});
