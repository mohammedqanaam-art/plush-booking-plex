import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Branches from "@/pages/Branches";
import HotelPhoneDirectory from "@/pages/HotelPhoneDirectory";
import HotelInformation, { HotelInformationContent } from "@/pages/HotelInformation";
import { KnowledgeContext } from "@/hooks/useInternalKnowledge";
import { branchRecords } from "@/data/knowledge";
import { publicBranches } from "@/data/publicBranches";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("hotel directory sections", () => {
  it("opens the complete phone directory in a safe new tab", () => {
    render(<MemoryRouter><Branches /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /أرقام الفنادق/ });
    expect(link.getAttribute("href")).toBe("/branches/phones");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: /معلومات الفنادق/ }).getAttribute("href")).toBe("/branches/information");
  });
  it("shows every hotel together, grouped by brand, and copies its number", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MemoryRouter><HotelPhoneDirectory /></MemoryRouter>);
    for (const branch of publicBranches) expect(screen.getByText(branch.name)).toBeDefined();
    expect(screen.getAllByRole("table")).toHaveLength(new Set(publicBranches.map(row => row.brand)).size);
    fireEvent.click(screen.getByRole("button", { name: "نسخ رقم بريرا العليا" }));
    expect(await screen.findByText("تم نسخ رقم بريرا العليا")).toBeDefined();
    expect(writeText).toHaveBeenCalledWith("+966112933354");
  });
  it("displays only the selected branch and resets it when the brand changes", () => {
    const records = branchRecords.slice(0, 2);
    render(<MemoryRouter><KnowledgeContext.Provider value={{ branches: [], branchRecords: records, knowledgeEntries: [] }}><HotelInformationContent /></KnowledgeContext.Provider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("الفرع"), { target: { value: records[0].id } });
    expect(screen.getByRole("heading", { name: records[0].branch })).toBeDefined();
    expect(screen.queryByRole("heading", { name: records[1].branch })).toBeNull();
    for (const name of ["التواصل", "المرافق والخدمات", "الوجبات والمطاعم", "الغرف والأجنحة", "القاعات وبكج العرسان"]) expect(screen.getByRole("heading", { name })).toBeDefined();
    fireEvent.change(screen.getByLabelText("البراند"), { target: { value: records[0].brand } });
    expect(screen.queryByRole("heading", { name: records[0].branch })).toBeNull();
  });
  it("never loads operational records without an authenticated server response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(<MemoryRouter><HotelInformation /></MemoryRouter>);
    expect(await screen.findByText("يلزم تسجيل الدخول لعرض المعلومات التشغيلية.")).toBeDefined();
    expect(screen.queryByLabelText("الفرع")).toBeNull();
  });
});
