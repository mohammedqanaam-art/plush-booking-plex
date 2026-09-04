import { describe, expect, it } from "vitest";
import { buildEmployeeKnowledge } from "../../netlify/functions/_shared/employeeKnowledge";

describe("employee assistant knowledge", () => {
  it("returns the branch wedding package without invoking a guessed general price", () => {
    const result = buildEmployeeKnowledge("كم بكج العرسان في بريرا النخيل؟");
    expect(result.fastReply).toContain("649 ريال");
    expect(result.fastReply).toContain("1,149 ريال");
    expect(result.fastReply).not.toContain("850 ريال");
    expect(result.fastReply).toContain("تحقّق من الفرع");
    expect(result.sources[0]?.title).toContain("معلومات الفنادق");
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
    expect(result.evidence).toContain("اختلاف UNO/CRO مع PMS");
  });
});
