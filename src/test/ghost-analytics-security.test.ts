import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("privacy-first visitor handling", () => {
  it("retires the detailed ghost console and keeps its old URL protected", () => {
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    const layout = fs.readFileSync(path.join(process.cwd(), "src/components/Layout.tsx"), "utf8");
    const dashboard = fs.readFileSync(path.join(process.cwd(), "src/pages/AdminDashboard.tsx"), "utf8");
    expect(app).toContain('path="/admin/ghost"');
    expect(app).toContain('<ProtectedRoute><Navigate to="/admin" replace /></ProtectedRoute>');
    expect(app).not.toContain("AdminGhost");
    expect(layout).not.toContain('/admin/ghost');
    expect(dashboard).not.toContain('/admin/ghost');
  });

  it("disables new telemetry collection and removes the tracker from the shell", () => {
    const analytics = fs.readFileSync(path.join(process.cwd(), "netlify/functions/analytics.ts"), "utf8");
    const layout = fs.readFileSync(path.join(process.cwd(), "src/components/Layout.tsx"), "utf8");
    expect(analytics).toContain("const analyticsCollectionEnabled = () => false");
    expect(analytics).toContain('collection: "disabled"');
    expect(layout).not.toContain("AnalyticsTracker");
  });
});
