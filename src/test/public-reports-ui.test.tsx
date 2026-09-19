import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BookingReports from "@/pages/BookingReports";
import { api, type PublicBookingReport } from "@/lib/api";

const report: PublicBookingReport = {
  generatedAt: "2026-07-14T08:00:00.000Z",
  updatedAt: "2026-07-14T07:00:00.000Z",
  period: { month: "يوليو", year: "2026", label: "يوليو / 2026" },
  summary: {
    uploadedRecords: 12,
    classifiedTotal: 10,
    confirmed: 8,
    cancelled: 2,
    ignored: 2,
    unattributed: 0,
    employeeCount: 1,
    confirmationRate: 80,
    cancelRate: 20,
  },
  employees: [{ id: "agent", name: "موظف تجريبي", confirmed: 8, cancelled: 2, total: 10, confirmationRate: 80 }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("public read-only reports", () => {
  it("syncs UNO for an authorized supervisor and reads the newly published report", async () => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "test-admin", role: "admin" }));
    const reload = vi.spyOn(api, "getPublicBookingReport").mockResolvedValue(report);
    const sync = vi.spyOn(api, "exportUnoReport").mockResolvedValue({ reservations: [], total: 10, searchedAt: "2026-09-18T10:00:00Z", canonicalUpdated: true, productivityReady: true, productivityRecords: 10, productivityEmployees: 1 });
    render(<MemoryRouter><BookingReports /></MemoryRouter>);
    await screen.findByText("حالة الحجوزات");
    fireEvent.click(screen.getByRole("button", { name: "مزامنة الشهر الحالي من UNO" }));
    await waitFor(() => expect(sync).toHaveBeenCalledWith());
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(reload).toHaveBeenLastCalledWith({ fresh: true });
    expect(await screen.findByText(/تم تحديث تقرير الموظفين من UNO بنجاح/)).toBeDefined();
  });
  it("does not report success when UNO fetch succeeds but productivity publication fails", async () => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "test-admin", role: "admin" }));
    const reload = vi.spyOn(api, "getPublicBookingReport").mockResolvedValue(report);
    vi.spyOn(api, "exportUnoReport").mockResolvedValue({ reservations: [], total: 10, searchedAt: "2026-09-18T10:00:00Z", canonicalUpdated: true, productivityReady: false, reportError: "بيانات الموظف ناقصة" });
    render(<MemoryRouter><BookingReports /></MemoryRouter>);
    await screen.findByText("حالة الحجوزات");
    fireEvent.click(screen.getByRole("button", { name: "مزامنة الشهر الحالي من UNO" }));
    expect(await screen.findByText("بيانات الموظف ناقصة")).toBeDefined();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/تم تحديث تقرير الموظفين من UNO بنجاح/)).toBeNull();
  });
  it("keeps existing figures visible when a saved-report refresh fails", async () => {
    vi.spyOn(api, "getPublicBookingReport").mockResolvedValueOnce(report).mockRejectedValueOnce(new Error("storage unavailable"));
    render(<MemoryRouter initialEntries={["/booking-reports?section=employees"]}><BookingReports /></MemoryRouter>);
    await screen.findByText("موظف تجريبي");
    fireEvent.click(screen.getByRole("button", { name: "تحديث العرض" }));
    expect(await screen.findByText(/الأرقام الظاهرة، إن وجدت، تخص آخر تحميل ناجح/)).toBeDefined();
    expect(screen.getByText("موظف تجريبي")).toBeDefined();
    expect(screen.queryByRole("button", { name: "مزامنة الشهر الحالي من UNO" })).toBeNull();
  });
  it("shows employee aggregates inside the booking report without management controls", async () => {
    vi.spyOn(api, "getPublicBookingReport").mockResolvedValue(report);
    const { container } = render(<MemoryRouter initialEntries={["/booking-reports?section=employees"]}><BookingReports /></MemoryRouter>);

    expect(await screen.findByText("موظف تجريبي")).toBeDefined();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText("حفظ التغييرات")).toBeNull();
    expect(screen.queryByText(/عرض فقط دون بيانات الضيوف/)).toBeNull();
  });

  it("shows the booking summary in the same report page", async () => {
    vi.spyOn(api, "getPublicBookingReport").mockResolvedValue(report);
    render(<MemoryRouter><BookingReports /></MemoryRouter>);

    expect(await screen.findByText("حالة الحجوزات")).toBeDefined();
    expect(screen.queryByText("ملخص الحجوزات ونتائج الموظفين.")).toBeNull();
    expect(screen.queryByText(/عرض فقط دون بيانات الضيوف/)).toBeNull();
  });

  it("reloads the latest saved report without triggering the retired CRO synchronization", async () => {
    const reportRequest = vi.spyOn(api, "getPublicBookingReport").mockResolvedValue(report);
    render(<MemoryRouter><BookingReports /></MemoryRouter>);

    await screen.findByText("حالة الحجوزات");
    fireEvent.click(await screen.findByRole("button", { name: "تحديث العرض" }));

    await waitFor(() => expect(reportRequest).toHaveBeenCalledTimes(2));
    expect(reportRequest).toHaveBeenLastCalledWith({ fresh: true });
    expect(screen.getByText("تم تحميل أحدث تقرير UNO محفوظ.")).toBeDefined();
    expect(screen.queryByText(/M\.ALDOSARI|CRO_PASSWORD|CRO_USERNAME/)).toBeNull();
  });
});
