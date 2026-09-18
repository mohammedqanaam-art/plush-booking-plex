import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isAvayaBridgeHealthy } from "../../netlify/functions/avaya-sync";

describe("Avaya local bridge security boundary", () => {
  const root = process.cwd();
  const bridge = fs.readFileSync(path.join(root, "scripts/avaya-bridge.ps1"), "utf8");
  const installer = fs.readFileSync(path.join(root, "scripts/install-avaya-bridge.ps1"), "utf8");
  const server = fs.readFileSync(path.join(root, "netlify/functions/avaya-sync.ts"), "utf8");

  it("runs every three hours without bypassing PowerShell policy", () => {
    expect(installer).toContain("[int]$IntervalMinutes = 180");
    expect(installer).toContain("[ValidateRange(15, 1440)]");
    expect(installer).not.toContain("ExecutionPolicy Bypass");
  });

  it("locks uploads to the approved HTTPS endpoint and limits historical files", () => {
    expect(bridge).toContain('Host.Equals("www.res-dashbord.com"');
    expect(bridge).toContain('$endpointUri.AbsolutePath.TrimEnd("/") -ne "/api/avaya/sync"');
    expect(bridge).toContain("AddHours(-$lookbackHours)");
    expect(bridge).toContain("Select-Object -Last $maxFilesPerRun");
    expect(bridge).not.toContain("172.21.10.202");
  });

  it("reports a credential-free heartbeat to the dashboard", () => {
    expect(bridge).toContain('$heartbeatHeaders["X-Avaya-Agent-Event"] = "heartbeat"');
    expect(bridge).toContain('"X-Avaya-Bridge-Version" = $BridgeVersion');
    expect(server).toContain('const BRIDGE_HEALTH_KEY = "bridge-health"');
    expect(server).toContain('req.headers.get("x-avaya-agent-event")');
  });

  it("marks a bridge stale after four hours", () => {
    const now = Date.parse("2026-08-14T12:00:00Z");
    expect(isAvayaBridgeHealthy("2026-08-14T08:00:01Z", now)).toBe(true);
    expect(isAvayaBridgeHealthy("2026-08-14T08:00:00Z", now)).toBe(true);
    expect(isAvayaBridgeHealthy("2026-08-14T07:59:59Z", now)).toBe(false);
    expect(isAvayaBridgeHealthy("invalid", now)).toBe(false);
  });
});
