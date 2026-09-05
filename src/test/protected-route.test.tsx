import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import { api } from "@/lib/api";

const adminRoles = ["superadmin", "admin"] as const;

const renderRoutes = () => render(
  <MemoryRouter initialEntries={["/admin/call-center"]}>
    <Routes>
      <Route path="/assistant" element={<div>employee-space</div>} />
      <Route path="/admin/call-center" element={(
        <ProtectedRoute allowedRoles={adminRoles}>
          <div>admin-call-center</div>
        </ProtectedRoute>
      )} />
    </Routes>
  </MemoryRouter>,
);

describe("role-aware protected routes", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("redirects an authenticated editor away from an admin-only route", async () => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "editor", role: "editor" }));
    vi.spyOn(api, "validateSession").mockResolvedValue({ username: "editor", role: "editor" });
    renderRoutes();
    expect(await screen.findByText("employee-space")).toBeInTheDocument();
    expect(screen.queryByText("admin-call-center")).not.toBeInTheDocument();
  });

  it("allows a server-validated administrator", async () => {
    sessionStorage.setItem("admin_session", JSON.stringify({ username: "admin", role: "admin" }));
    vi.spyOn(api, "validateSession").mockResolvedValue({ username: "admin", role: "admin" });
    renderRoutes();
    expect(await screen.findByText("admin-call-center")).toBeInTheDocument();
  });
});
