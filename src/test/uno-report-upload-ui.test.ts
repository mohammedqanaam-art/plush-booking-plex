import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("UNO report upload UI", () => {
  it("offers SpreadsheetML .xls inspection and explicit approval before replacement", () => {
    const page = fs.readFileSync(path.resolve("src/pages/AdminDashboard.tsx"), "utf8");
    expect(page).toContain(".xls,.xml,.csv");
    expect(page).toContain("اختيار تقرير UNO أو CSV");
    expect(page).toContain("معاينة قبل الاعتماد");
    expect(page).toContain("اعتماد واستبدال البيانات الحالية");
    expect(page).toContain("غير منسوبة");
  });
});
