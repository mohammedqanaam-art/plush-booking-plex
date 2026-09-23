import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MadareemApp from "../madareem/MadareemApp";
import { rooms, searchFacts } from "../madareem/data";
import { protocols, roomChecks } from "../madareem/supplement";

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
  it("exposes 12 proposed call scenarios and their guest replies", () => {
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
