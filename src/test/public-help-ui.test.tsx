import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicHelp from "@/pages/PublicHelp";
import Dashboard from "@/pages/Dashboard";
import { publicServiceGuides } from "@/data/publicServiceGuides";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("visitor guidance without a session", () => {
  it.each(publicServiceGuides)("renders $title without accessing private APIs", guide => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<MemoryRouter initialEntries={[guide.path]}><PublicHelp topic={guide.id} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: guide.title, level: 1 })).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(guide.steps.length);
    expect(screen.getByRole("link", { name: guide.action.label }).getAttribute("href")).toBe(guide.action.to);
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByText("الطلبات والمتابعة")).toBeNull();
  });

  it("opens the call guide from the homepage as a visitor", () => {
    render(<MemoryRouter><Routes><Route path="/" element={<Dashboard />} /><Route path="/guides/calls" element={<PublicHelp topic="calls" />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: /المكالمات وخريطة البروتوكول/ }));
    expect(screen.getByRole("heading", { name: "المكالمات وخريطة البروتوكول", level: 1 })).toBeDefined();
  });

  it("filters FAQs and gives a clear empty result", () => {
    render(<MemoryRouter><PublicHelp /></MemoryRouter>);
    const search = screen.getByRole("searchbox", { name: "البحث في الأسئلة الشائعة" });
    fireEvent.change(search, { target: { value: "منصة" } });
    expect(screen.getByText("كيف أعدّل أو ألغي حجزًا من منصة خارجية؟")).toBeDefined();
    expect(screen.queryByText("هل يمكن تأكيد الدخول المبكر من هذه الصفحة؟")).toBeNull();
    fireEvent.change(search, { target: { value: "لا-يوجد-تطابق" } });
    expect(screen.getByRole("status").textContent).toContain("لا توجد نتيجة مطابقة");
  });
});
