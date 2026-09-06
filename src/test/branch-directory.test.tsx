import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import Branches from "@/pages/Branches";
import { publicBranches } from "@/data/publicBranches";
import { publicBranchContacts } from "@/data/publicBranchContacts";
import { hotelBranches } from "@/data/hotels";
const History = () => { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>رجوع المتصفح</button>; };
const show = (url = "/branches") => render(<MemoryRouter initialEntries={[url]}><History /><Branches /></MemoryRouter>);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("reception directory", () => {
  it("opens brands, branches and details and returns through both levels", () => {
    show();
    fireEvent.click(screen.getByRole("link", { name: /^بريرا/ }));
    expect(screen.getByRole("heading", { name: "فروع بريرا" })).toBeDefined();
    expect(screen.queryByRole("link", { name: /بودل جابر/ })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /بريرا العليا/ }));
    expect(screen.getByRole("link", { name: "اتصال بالاستقبال" }).getAttribute("href")).toBe("tel:+966112933354");
    fireEvent.click(screen.getByRole("link", { name: "العودة إلى الفروع" }));
    expect(screen.getByRole("heading", { name: "فروع بريرا" })).toBeDefined();
    fireEvent.click(screen.getByRole("link", { name: "البراندات" }));
    expect(screen.getByRole("heading", { name: "اختر البراند" })).toBeDefined();
  });
  it("preserves search and browser history when opening details", () => {
    show("/branches?brand=بريرا");
    fireEvent.change(screen.getByPlaceholderText("اسم الفرع أو المدينة…"), { target: { value: "العليا" } });
    fireEvent.click(screen.getByRole("link", { name: /بريرا العليا/ }));
    fireEvent.click(screen.getByRole("button", { name: "رجوع المتصفح" }));
    expect((screen.getByPlaceholderText("اسم الفرع أو المدينة…") as HTMLInputElement).value).toBe("العليا");
  });
  it("supports direct branch links and copying the number", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    show("/branches?brand=بريرا&branch=braira-olaya");
    fireEvent.click(screen.getByRole("button", { name: "نسخ الرقم" }));
    expect(await screen.findByText("تم نسخ الرقم")).toBeDefined();
    expect(writeText).toHaveBeenCalledWith("+966112933354");
  });
  it("handles unavailable clipboard without reporting success", async () => {
    vi.stubGlobal("navigator", {});
    show("/branches?branch=braira-olaya");
    fireEvent.click(screen.getByRole("button", { name: "نسخ الرقم" }));
    expect(await screen.findByText(/تعذر النسخ تلقائيًا/)).toBeDefined();
  });
  it("does not show a different branch for an invalid link", () => {
    show("/branches?brand=بودل&branch=braira-olaya");
    expect(screen.getByText("تعذر العثور على الفرع المطلوب.")).toBeDefined();
    expect(screen.queryByRole("link", { name: "اتصال بالاستقبال" })).toBeNull();
  });
  it("publishes only reception numbers mapped to known branch IDs", () => {
    expect(Object.keys(publicBranchContacts).sort()).toEqual(publicBranches.map(b => b.id).sort());
    for (const branch of publicBranches) {
      const contact = publicBranchContacts[branch.id];
      expect(Object.keys(contact).every(k => ["phone", "note", "sourceUrl"].includes(k))).toBe(true);
      expect(contact.phone).toMatch(/^\+966\d{9}$/);
      if (branch.id === "braira-hettin") {
        expect(contact.phone).toBe("+966112364247");
        expect(contact.sourceUrl).toBe("https://brairahotels.com/hittin/");
        continue;
      }
      const raw = hotelBranches.find(h => h.id === branch.id)?.phone.replace(/\D/g, "").slice(-9);
      expect(contact.phone?.slice(-9)).toBe(raw);
    }
  });
});
