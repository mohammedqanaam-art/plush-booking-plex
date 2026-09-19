import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import KnowledgeBank from "@/pages/KnowledgeBank";

describe("protected knowledge loading", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests protected data with credentials and no cache before rendering", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ branches: [], branchRecords: [], knowledgeEntries: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter><KnowledgeBank /></MemoryRouter>);
    expect(await screen.findByPlaceholderText(/إفطار/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/employee/knowledge", expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
  });

  it("does not substitute embedded data on failure and allows a safe retry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ branches: [], branchRecords: [], knowledgeEntries: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter><KnowledgeBank /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("لم تُعرض بيانات محفوظة أو قديمة");
    expect(screen.queryByPlaceholderText(/إفطار/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/إفطار/)).toBeInTheDocument());
  });
});
