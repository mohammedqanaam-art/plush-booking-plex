import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HotelInformation from "@/pages/HotelInformation";
import handler, { publicHotelRecords } from "../../netlify/functions/public-hotel-information";
import { branchRecords } from "@/data/knowledge";
import { publicBranches } from "@/data/publicBranches";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("anonymous hotel information", () => {
  it("serves guest details without authentication and excludes private content", async () => {
    const response = await handler(new Request("https://example.com/api/hotels/information"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.branchRecords.length).toBe(publicBranches.length);
    const record = branchRecords.find(row => publicBranches.some(identity => identity.id === row.id))!;
    expect(record).toBeDefined();
    const secret = "PRIVATE_SENTINEL";
    const data = publicHotelRecords([{ ...record, managerName: secret, managerPhone: secret, managerEmail: secret, notes: secret, salesPhone: secret, sourceFiles: [secret], attachments: [{ title: secret, type: "pdf", url: secret }] }]);
    expect(JSON.stringify(data)).not.toContain(secret);
    expect(data.find(row => row.id === record.id)?.roomTypes).toEqual(record.roomTypes);
  });
  it("lets a visitor select a hotel without requesting employee knowledge", async () => {
    const response = await handler(new Request("https://example.com/api/hotels/information"));
    const fetcher = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetcher);
    render(<MemoryRouter><HotelInformation /></MemoryRouter>);
    const select = await screen.findByLabelText("الفرع");
    fireEvent.change(select, { target: { value: publicBranches[0].id } });
    expect(screen.getByRole("heading", { name: publicBranches[0].name })).toBeDefined();
    expect(screen.queryByText("مدير الفرع")).toBeNull();
    expect(screen.queryByText("الملاحظات والمصادر")).toBeNull();
    expect(fetcher).toHaveBeenCalledWith("/api/hotels/information", expect.any(Object));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
