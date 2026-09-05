import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminAvayaReports from "@/pages/AdminAvayaReports";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("Avaya admin upload center", () => {
  it("shows the three required exports only to an authenticated uploader", async () => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "tester", role: "admin" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ report: null, sync: { configured: true, updatedAt: null } }) }));
    render(<MemoryRouter initialEntries={["/admin/avaya-reports"]}><AdminAvayaReports /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "تقارير Avaya" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "المزامنة التلقائية" })).toBeInTheDocument();
    expect(screen.getByLabelText("من تاريخ التقرير")).toBeInTheDocument();
    expect(screen.getByLabelText("إلى تاريخ التقرير")).toBeInTheDocument();
    expect(screen.getByText("User Inbound Summary")).toBeInTheDocument();
    expect(screen.getByText("Feature Trace")).toBeInTheDocument();
    expect(screen.getByText("Agent Time Card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /إنشاء التقرير الموحد/ })).toBeDisabled();
    expect(await screen.findByText("بانتظار أول مجموعة تقارير مكتملة.")).toBeInTheDocument();
  }, 15_000);

  it("loads the latest automatically synchronized report", async () => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "tester", role: "admin" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sync: { configured: true, updatedAt: "2026-07-17T00:00:00.000Z" },
        availableRanges: [{
          reportId: "report-1",
          from: "2026-07-16",
          to: "2026-07-17",
          rangeStart: "Start",
          rangeEnd: "End",
          syncedAt: "2026-07-17T00:00:00.000Z",
          employeeCount: 1,
        }],
        selectedRange: { from: "2026-07-16", to: "2026-07-17" },
        report: {
          reportId: "report-1",
          syncedAt: "2026-07-17T00:00:00.000Z",
          rangeStart: "Start",
          rangeEnd: "End",
          warnings: [],
          sourceCounts: { inbound: 1, dnd: 1, timecard: 1 },
          sources: [],
          employees: [{
            key: "id:9999", employeeId: "9999", name: "Sample Agent(9999)", avgRingingSeconds: 5,
            answeredCalls: 20, missedCalls: 1, inboundDurationSeconds: 600, dndDurationSeconds: 0,
            loggedInDurationSeconds: 28800, dndEvents: 0, loginSessions: 1, hasInbound: true, hasDnd: true, hasTimecard: true,
          }],
        },
      }),
    }));

    render(<MemoryRouter initialEntries={["/admin/avaya-reports"]}><AdminAvayaReports /></MemoryRouter>);

    expect(await screen.findByText("مزامن تلقائياً")).toBeInTheDocument();
    expect(screen.getByText("Sample Agent")).toBeInTheDocument();
  });

  it("requests an archived report using the selected date range", async () => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "tester", role: "admin" }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sync: { configured: true, updatedAt: null },
        availableRanges: [],
        selectedRange: null,
        report: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryRouter initialEntries={["/admin/avaya-reports"]}><AdminAvayaReports /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText("من تاريخ التقرير")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("من تاريخ التقرير"), { target: { value: "2026-07-27" } });
    fireEvent.change(screen.getByLabelText("إلى تاريخ التقرير"), { target: { value: "2026-07-28" } });
    fireEvent.click(screen.getByRole("button", { name: "عرض الفترة" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/avaya/sync?from=2026-07-27&to=2026-07-28",
      expect.objectContaining({ cache: "no-store" }),
    ));
  });
});
