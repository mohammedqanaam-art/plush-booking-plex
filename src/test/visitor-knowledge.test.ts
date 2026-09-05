import { describe, expect, it } from "vitest";
import { buildVisitorKnowledge } from "../../netlify/functions/_shared/visitorKnowledge";

describe("visitor structured BHG knowledge", () => {
  it("returns the verified nearby BHG options around Kingdom Centre", () => {
    const result = buildVisitorKnowledge("وش أقرب فندق من برج المملكة؟");

    expect(result.locationSensitive).toBe(true);
    expect(result.fastReply).toContain("بريرا العليا");
    expect(result.fastReply).toContain("نارسس ذا رويال");
    expect(result.fastReply).toContain("بودل العليا");
    expect(result.fastReply).not.toContain("السليمانية");
    expect(result.fastReply).not.toContain("4.4");
    expect(result.sources).toHaveLength(3);
  });

  it("does not guess a user's current position", () => {
    const result = buildVisitorKnowledge("ما أقرب فندق مني؟");

    expect(result.fastReply).toContain("اكتب اسم الحي أو معلمًا قريبًا");
    expect(result.fastReply).not.toMatch(/السليمانية|العليا|قرطبة/);
  });

  it("lists brand branches in a city without calling the model", () => {
    const result = buildVisitorKnowledge("ما فروع بودل في الرياض؟");

    expect(result.fastReply).toContain("بودل العليا");
    expect(result.fastReply).toContain("بودل السليمانية");
    expect(result.fastReply).not.toContain("بريرا العليا");
  });

  it("answers a branch service from the structured operational directory", () => {
    const result = buildVisitorKnowledge("هل يوجد مسبح في بريرا العليا؟");

    expect(result.fastReply).toContain("بريرا العليا");
    expect(result.fastReply).toContain("المسبح");
    expect(result.fastReply).toContain("10ص-6م");
  });
});
