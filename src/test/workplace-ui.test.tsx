import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegistrationForm from "@/components/RegistrationForm";
import OperationsPortal from "@/pages/OperationsPortal";
import { operationsGuide } from "../../netlify/functions/_shared/operationsGuide";

describe("registration and employee workplace interfaces", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("submits the requested account fields and shows a pending review confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const onBack = vi.fn(); render(<RegistrationForm onBack={onBack} />);
    for (const [label, value] of [["الاسم الأول", "محمد"], ["اسم العائلة", "الدوسري"], ["البريد الإلكتروني", "test@example.com"], ["رقم الجوال", "0500000000"], ["كلمة المرور (12 حرفًا على الأقل)", "example-password-123"]]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: "رفع طلب التسجيل" }));
    expect(await screen.findByRole("status")).toHaveTextContent("تم رفع طلبكم لمدير النظام");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/account-requests");
    expect(JSON.parse(init.body)).toMatchObject({ firstName: "محمد", lastName: "الدوسري", email: "test@example.com", phone: "0500000000" });
    expect(JSON.parse(init.body)).not.toHaveProperty("role");
    fireEvent.click(screen.getByRole("button", { name: "العودة لتسجيل الدخول" })); expect(onBack).toHaveBeenCalled();
  });
  it("navigates protocols and feedback, then persists feedback through the server", async () => {
    const data = { guide: operationsGuide, records: [], availability: [], canManage: false, username: "employee" };
    const fetchMock = vi.fn().mockImplementation((_url, init) => Promise.resolve(new Response(JSON.stringify(init.method === "POST" ? { ok: true } : data))));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter initialEntries={["/workplace?section=calls"]}><OperationsPortal /></MemoryRouter>);
    expect(await screen.findByText("خريطة بروتوكول المكالمة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حجز جديد" }));
    expect(screen.getByRole("button", { name: "العودة لاختيار المسار" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "أقسام مساحة العمل" })).getByRole("button", { name: "التغذية الراجعة" }));
    fireEvent.change(screen.getByLabelText("عنوان الطلب"), { target: { value: "اقتراح" } });
    fireEvent.change(screen.getByLabelText("الملاحظة أو اقتراح التحسين"), { target: { value: "تسهيل متابعة المكالمة" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الطلب" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("تم حفظ الطلب بنجاح"));
    expect(fetchMock.mock.calls.find(([, init]) => init.method === "POST")?.[1].body).toContain('"kind":"feedback"');
  });
  it("shows missing availability honestly and does not offer employees a publication control", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ guide: operationsGuide, records: [], availability: [], canManage: false, username: "employee" }))));
    render(<MemoryRouter initialEntries={["/workplace?section=arrival"]}><OperationsPortal /></MemoryRouter>);
    expect(await screen.findByText(/لا يوجد تأكيد استقبال ساري حاليًا/)).toBeInTheDocument();
    expect(screen.queryByText("تسجيل تأكيد توفر من الاستقبال")).not.toBeInTheDocument();
  });
});
