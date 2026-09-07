import { afterEach, describe, expect, it, vi } from "vitest";
import { applyLiveKnowledge, knowledgeTabs, parseSheetCsv, readKnowledgeTab } from "../../netlify/functions/_shared/liveKnowledge";
import { branchRecords } from "../data/knowledge";
import { matchesKnowledgeQuery } from "../lib/knowledgeTypes";

afterEach(() => vi.unstubAllGlobals());
describe("sheet-backed knowledge", () => {
  it("parses Arabic CSV including quoted commas, newlines and escaped quotes", () => {
    expect(parseSheetCsv('"اسم","الوصف"\r\n"بريرا","بوفيه, مع \\"اختيار\\""'.replaceAll('\\"', '""'))).toHaveLength(2);
    expect(parseSheetCsv('"a","line1\nline2"\n"b","x"')[0][1]).toBe("line1\nline2");
    expect(() => parseSheetCsv("<html>Sign in</html>")).toThrow();
    expect(() => parseSheetCsv('"unclosed')).toThrow();
  });
  it("rejects a login response, changed headers, and broken cells", async () => {
    for (const body of ["<html>Login</html>", '"wrong header","data"', '"الفروع","#ERROR!"']) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
      await expect(readKnowledgeTab(knowledgeTabs[0], null)).rejects.toThrow();
    }
  });
  it("updates only the matching branch and preserves differing branch meal hours", () => {
    const originals = branchRecords.filter((row) => ["بريرا النخيل", "بودل النخيل"].includes(row.branch));
    const result = applyLiveKnowledge(originals, [{ key: "meals", fetchedAt: "2026-09-07T12:00:00Z", url: "https://docs.google.com/example", rows: [["Barirra Nakheel", "89 ريال", "حسب الطلب", "حسب الطلب"]] }]);
    expect(result.find((row) => row.branch === "بريرا النخيل")?.breakfastInfo).toBe("89 ريال");
    expect(result.find((row) => row.branch === "بودل النخيل")?.breakfastInfo).toBe(originals.find((row) => row.branch === "بودل النخيل")?.breakfastInfo);
    expect(originals.find((row) => row.branch === "بريرا النخيل")?.breakfastInfo).not.toBe("89 ريال");
  });
  it("searches Arabic without requiring identical accents or word order", () => {
    expect(matchesKnowledgeQuery("الإفطار في بريرا قرطبة", "قرطبه افطار")).toBe(true);
    expect(matchesKnowledgeQuery("مسبح بريرا العليا", "مسبح ابها")).toBe(false);
  });
});
