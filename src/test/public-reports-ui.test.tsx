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
});

describe("public read-only reports", () => {
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
