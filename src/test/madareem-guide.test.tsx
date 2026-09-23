import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MadareemApp from "../madareem/MadareemApp";
import { rooms, searchFacts } from "../madareem/data";
import { protocols, roomChecks, englishReplies } from "../madareem/supplement";
import { filterRooms, parseAmount } from "../madareem/service-utils";

afterEach(() => { cleanup(); window.location.hash = ""; });
describe("Madareem expanded employee guide", () => {
  it("finds the new accessibility information and proposed call guidance", () => {
    expect(searchFacts("سرير طبي").some(f => f.id === "accessible-equipment")).toBe(true);
    expect(searchFacts("تنسيق النقل").some(f => f.section === "protocol")).toBe(true);
    expect(rooms.every(r => roomChecks[r.id]?.length > 0)).toBe(true);
  });
  it("filters villas and switches to the comparison table", () => {
    window.location.hash = "rooms";
    render(<MadareemApp />);
    fireEvent.click(screen.getByRole("button", { name: /^فلل/ }));
    expect(document.querySelectorAll(".md-room")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "جدول مقارنة" }));
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(2);
  });
  it("exposes the proposed call scenarios and their guest replies", () => {
    window.location.hash = "protocol";
    render(<MadareemApp />);
    expect(document.querySelectorAll(".md-protocol")).toHaveLength(protocols.length);
    expect(screen.getByText(/ليست سياسات معتمدة/)).toBeInTheDocument();
    expect(screen.getByText(protocols[0].reply)).toBeInTheDocument();
  });
  it("keeps the existing discount calculator functional", () => {
    window.location.hash = "overview";
    vi.stubGlobal("scrollTo", vi.fn());
    render(<MadareemApp />);
    fireEvent.change(screen.getByLabelText("المبلغ"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("الخصم %"), { target: { value: "20" } });
    expect(screen.getByText("160.00")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});


describe("Employee service tasks", () => {
  it("matches colloquial breakfast and Arabic extension searches", () => {
    expect(searchFacts("وش وقت الفطور")[0].id).toBe("tropicana");
    expect(searchFacts("تحويلة ٧٧٢١").some(f => f.text.includes("7721"))).toBe(true);
    expect(searchFacts("شيك ان").some(f => f.id === "check-in")).toBe(true);
    expect(searchFacts("zzzzzzz")).toHaveLength(0);
  });
  it("keeps a private pool distinct from a pool view and respects published capacity", () => {
    expect(filterRooms("الكل", "6", "pool", "").map(r => r.id)).toEqual(["pool-villa"]);
    expect(filterRooms("الكل", "2", "accessible", "")).toHaveLength(0);
    expect(filterRooms("غرف", "4", "", "")).toHaveLength(0);
  });
  it("supports Arabic decimals and rejects malformed financial input", () => {
    expect(parseAmount("١٬٢٣٤٫٥٠")).toBe(1234.5);
    expect(parseAmount("1,23")).toBeNaN();
    expect(parseAmount("-200")).toBeNaN();
    render(<MadareemApp />);
    fireEvent.change(screen.getByLabelText("المبلغ"), { target: { value: "٢٠٠٠" } });
    fireEvent.change(screen.getByLabelText("الخصم %"), { target: { value: "٢٠" } });
    expect(screen.getByText("1,600.00")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("الخصم %"), { target: { value: "١٠١" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("1,600.00")).not.toBeInTheDocument();
  });
  it("compares selected categories and preserves them across group filtering", () => {
    window.location.hash = "rooms";
    render(<MadareemApp />);
    fireEvent.click(screen.getByRole("button", { name: "أضف للمقارنة: غرفة قياسية كينج" }));
    fireEvent.click(screen.getByRole("button", { name: "أضف للمقارنة: غرفة ديلوكس" }));
    fireEvent.click(screen.getByRole("button", { name: /^فلل/ }));
    fireEvent.click(screen.getByRole("button", { name: "أضف للمقارنة: فيلا بمسبح خاص" }));
    expect(screen.getByRole("button", { name: "أضف للمقارنة: فيلا ديلوكس" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "قارن الفئات المختارة" }));
    const comparison = screen.getByRole("region", { name: "جدول المقارنة التفصيلية" });
    expect(comparison).toHaveTextContent("غرفة قياسية كينج");
    expect(comparison).toHaveTextContent("فيلا بمسبح خاص");
  });
  it("copies the selected reply language without internal instructions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    window.location.hash = "protocol";
    render(<MadareemApp />);
    expect(protocols.every(p => Boolean(englishReplies[p.id]))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "نسخ الرد: reply-opening" }));
    expect(writeText).toHaveBeenCalledWith(englishReplies.opening);
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining(protocols[0].steps[0]));
  });
});
