import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import AdminCroExport from "@/pages/AdminCroExport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CRO automatic synchronization", () => {
  it("uses the Netlify half-hour schedule", () => {
    const scheduled = readFileSync("netlify/functions/cro-sync-scheduled.ts", "utf8");
    const shared = readFileSync("netlify/functions/_shared/croSync.ts", "utf8");
    expect(scheduled).toContain('schedule: "*/30 * * * *"');
    expect(shared).toContain('schedule: "*/30 * * * *"');
  });

  it("shows the professional sync icon and 30-minute status", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/cro-export")) {
        return new Response(JSON.stringify({ configured: true, exportConfigured: true, requiredEnv: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        status: { state: "success", finishedAt: "2026-07-17T09:00:00.000Z" },
        automation: {
          configured: true,
          enabled: true,
          intervalMinutes: 30,
          mode: "rolling-month",
          from: "2026-07-01",
          to: "2026-07-31",
          schedule: "*/30 * * * *",
        },
      }), { status: 200 });
    }));

    render(<MemoryRouter><AdminCroExport /></MemoryRouter>);

    expect(screen.getByRole("img", { name: "أيقونة مزامنة الحجوزات" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/كل 30 دقيقة/).length).toBeGreaterThan(0));
    expect(screen.getByRole("switch", { name: "تشغيل مزامنة CRO" })).toBeChecked();
    expect(screen.getByRole("button", { name: "حفظ التحكم" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /أرشفة فترة سابقة/ })).toBeEnabled();
  });

  it("lets an administrator release a stuck background job", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/cro-export")) {
        return new Response(JSON.stringify({ configured: true, exportConfigured: true, requiredEnv: [] }), { status: 200 });
      }
      const automation = {
        configured: true,
        enabled: false,
        intervalMinutes: 120,
        mode: "rolling-month",
        from: "2026-07-01",
        to: "2026-07-31",
        schedule: "*/30 * * * *",
      };
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({
          status: { state: "cancelled", message: "تم إلغاء مهمة مزامنة CRO وتحرير النظام." },
          automation,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        status: {
          state: "running",
          from: "2026-01-01",
          to: "2026-06-30",
          startedAt: "2026-07-28T10:00:00.000Z",
        },
        automation,
      }), { status: 200 });
    }));

    render(<MemoryRouter><AdminCroExport /></MemoryRouter>);

    const cancel = await screen.findByRole("button", { name: "إلغاء العملية العالقة" });
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByText("تم إلغاء مهمة مزامنة CRO وتحرير النظام.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "إلغاء العملية العالقة" })).not.toBeInTheDocument();
  });
});
