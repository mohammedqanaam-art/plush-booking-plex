import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmployeeAssistant from "@/pages/EmployeeAssistant";

const emptyWorkspace = {
  tasks: [], shifts: [], qualityNotes: [], callReviews: [], marketingEngagements: [], callCenterProjects: [], generatedAt: new Date().toISOString(),
};

const callCenterOperations = {
  avaya: {
    reportSyncConfigured: true,
    agentLaunchConfigured: false,
    launchUrl: null,
    product: "يتطلب تحديد المنتج",
    network: { mode: "off", required: false, configured: false, detected: true, trusted: false, allowed: true, reason: "not-required" },
    accessPolicy: "شبكة مؤسسية",
    browserPolicy: { desktopVoice: "Chrome أو Edge", safari: "يحتاج اعتمادًا", mobile: "تطبيق معتمد" },
  },
  forecast: {
    status: "insufficient",
    confidence: "low",
    sampleDays: 0,
    requiredDays: 7,
    excludedReports: 0,
    generatedAt: new Date().toISOString(),
    latest: null,
    observed: [],
    forecast: [],
    drivers: [],
    definitions: { offered: "المعروض", missedProxy: "الفائت ليس Queue Abandonment", prediction: "توقع" },
  },
  forecastScope: {
    request: { kind: "overall" },
    status: "overall",
    label: "الإجمالي — التقرير غير المقسّم",
    matchedReports: 0,
    availableReports: 0,
    message: "يعرض تقارير Avaya الإجمالية غير الموسومة فقط.",
    options: [
      { key: "overall", kind: "overall", label: "الإجمالي — التقرير غير المقسّم" },
      {
        key: "project:11111111-1111-4111-8111-111111111111",
        kind: "project",
        label: "المشروع: مشروع مصرفي",
        projectId: "11111111-1111-4111-8111-111111111111",
      },
    ],
  },
};

describe("employee agent hub UI", () => {
  beforeEach(() => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "Agent One", role: "editor" }));
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/employee/workspace" && !init?.method) {
        return Promise.resolve(new Response(JSON.stringify(emptyWorkspace), { status: 200 }));
      }
      if (url === "/api/employee/agents") {
        return Promise.resolve(new Response(JSON.stringify({
          agentId: "shift_director",
          agentName: "مدير الوردية الذكي",
          model: "gpt-5.6-sol",
          reply: "ابدأ بمراجعة الحجوزات المفتوحة ثم سلّم الحالات الحرجة للمشرف.",
          requestId: "request-1",
          createdAt: new Date().toISOString(),
        }), { status: 200 }));
      }
      if (url.startsWith("/api/call-center/operations")) {
        return Promise.resolve(new Response(JSON.stringify(callCenterOperations), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
    }));
  });

  it("renders the seven-agent employee workspace", async () => {
    render(<MemoryRouter><EmployeeAssistant /></MemoryRouter>);
    expect(await screen.findByText("فريق الوكلاء السبعة")).toBeInTheDocument();
    expect(screen.getByText("وكيل مطابقة الحجوزات")).toBeInTheDocument();
    expect(screen.getByText("مستمع الإجراءات")).toBeInTheDocument();
    expect(screen.getByText("مستمع تجربة الضيف")).toBeInTheDocument();
    expect(screen.getByText("مدير الوردية الذكي")).toBeInTheDocument();
  });

  it("runs the selected agent through the authenticated API", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<MemoryRouter><EmployeeAssistant /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /^الوكلاء$/ }));
    fireEvent.change(screen.getByPlaceholderText(/اكتب المطلوب/), { target: { value: "رتب أولويات الشفت" } });
    fireEvent.click(screen.getByRole("button", { name: /تشغيل الوكيل/ }));

    expect(await screen.findByText(/ابدأ بمراجعة الحجوزات المفتوحة/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/employee/agents" && init?.method === "POST")).toBe(true);
  }, 20_000);

  it("opens call-center operations directly from the admin route", async () => {
    render(<MemoryRouter initialEntries={["/admin/call-center"]}><EmployeeAssistant /></MemoryRouter>);
    expect(await screen.findByText("توقع حركة المكالمات")).toBeInTheDocument();
    expect(screen.getByText("بوابة Avaya المعتمدة")).toBeInTheDocument();
    expect(screen.getByText("أدوات الموظفين حسب المشروع")).toBeInTheDocument();
  });

  it("requests a project-scoped forecast from the authenticated operations API", async () => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "Supervisor", role: "admin" }));
    const fetchMock = vi.mocked(fetch);
    render(<MemoryRouter initialEntries={["/admin/call-center"]}><EmployeeAssistant /></MemoryRouter>);

    const filter = await screen.findByRole("combobox", { name: "نطاق توقع المكالمات" });
    fireEvent.change(filter, { target: { value: "project:11111111-1111-4111-8111-111111111111" } });

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => (
      url === "/api/call-center/operations?projectId=11111111-1111-4111-8111-111111111111"
    ))).toBe(true));
  });
});
