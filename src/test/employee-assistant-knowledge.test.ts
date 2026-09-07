import { branchRecords } from "../data/knowledge";
import type { KnowledgeSyncStatus } from "../lib/knowledgeTypes";
import { describe, expect, it } from "vitest";
import { buildEmployeeKnowledge, buildBranchKnowledge, branchForQuestion } from "../../netlify/functions/_shared/employeeKnowledge";

describe("employee assistant knowledge", () => {
  it("uses the branch sheet price and never substitutes a general brand package", () => {
    const sync: KnowledgeSyncStatus = { state: "snapshot", checkedAt: "2026-09-07T12:00:00Z", snapshotDate: "2026-07-13", message: "نسخة محفوظة تحتاج التحقق", tabs: [] };
    const result = buildBranchKnowledge("كم بكج العرسان في بريرا النخيل؟", branchRecords, sync);
    expect(result.fastReply).toContain("850 ريال");
    expect(result.fastReply).not.toContain("649 ريال");
    expect(result.fastReply).toContain("تحتاج التحقق");
    expect(result.sources[0]?.url).toContain("docs.google.com");
  });
  it("never picks the other brand at the same location", () => {
    expect(branchForQuestion("بودل العليا", branchRecords)?.branch).toBe("بودل العليا");
    expect(branchForQuestion("بريرا العليا", branchRecords)?.branch).toBe("بريرا العليا");
    expect(branchForQuestion("العليا", branchRecords)).toBeNull();
  });

  it("asks for a branch when a wedding-package question is ambiguous", () => {
    const result = buildEmployeeKnowledge("كم سعر بكج العرسان؟");
    expect(result.fastReply).toContain("حدد اسم الفندق أو الفرع");
  });

  it("returns the approved complaint escalation checklist for a generic question", () => {
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

