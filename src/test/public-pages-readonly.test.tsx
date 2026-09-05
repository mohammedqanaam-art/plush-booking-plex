import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Branches from "@/pages/Branches";
import KnowledgeBank from "@/pages/KnowledgeBank";
import fs from "node:fs";
import path from "node:path";

describe("public pages are read-only", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the branches page concise", () => {
    render(<MemoryRouter><Branches /></MemoryRouter>);
    expect(screen.queryByText(/هذه الصفحة للعرض فقط/)).toBeNull();
    expect(screen.getByPlaceholderText(/اسم الفرع/)).toBeDefined();
  });

  it("does not render knowledge without a successful authenticated response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    render(<MemoryRouter><KnowledgeBank /></MemoryRouter>);
    expect(await screen.findByText("يلزم تسجيل الدخول لعرض المعلومات التشغيلية.")).toBeDefined();
    expect(screen.queryByPlaceholderText(/إفطار/)).toBeNull();
  });

  it("redirects the retired public upload center to admin login", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain('<Route path="/upload-center" element={<Navigate to="/admin/login" replace />} />');
    expect(fs.existsSync(path.join(process.cwd(), "src/pages/UploadCenter.tsx"))).toBe(false);
  });

  it("protects the booking report and redirects the old employee route", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain('<Route path="/employees" element={<Navigate to="/booking-reports?section=employees" replace />} />');
    expect(app).toContain('<Route path="/booking-reports" element={<ProtectedRoute><BookingReports /></ProtectedRoute>} />');
    expect(app).not.toContain('const Employees = lazy');
  });

  it("removes the policies page and redirects its old route home", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    const dashboard = fs.readFileSync(path.join(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");
    expect(app).toContain('<Route path="/policies" element={<Navigate to="/" replace />} />');
    expect(app).not.toContain('const Policies = lazy');
    expect(dashboard).not.toContain('to: "/policies"');
  });
});
