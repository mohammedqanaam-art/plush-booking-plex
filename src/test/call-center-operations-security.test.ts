import { describe, expect, it, vi } from "vitest";
import {
  mayAccessCallCenterOperations,
  mayExposeAvayaLaunchUrl,
  parseForecastScopeRequest,
} from "../../netlify/functions/call-center-operations";
import { evaluateAdminNetwork } from "../../netlify/functions/_shared/corporateNetwork";

const configureNetwork = (values: Record<string, string>) => vi.stubGlobal("Netlify", {
  env: { get: (name: string) => values[name] || undefined },
});

describe("call-center operations security", () => {
  it("restricts the operations API to administrators", () => {
    expect(mayAccessCallCenterOperations("superadmin")).toBe(true);
    expect(mayAccessCallCenterOperations("admin")).toBe(true);
    expect(mayAccessCallCenterOperations("editor")).toBe(false);
    expect(mayAccessCallCenterOperations("viewer")).toBe(false);
  });

  it("does not expose the Avaya launch URL in observe mode without a real allowlist", () => {
    configureNetwork({ ADMIN_NETWORK_MODE: "observe" });
    const network = evaluateAdminNetwork("admin", "203.0.113.18");

    expect(network).toMatchObject({ configured: false, trusted: false, allowed: true });
    expect(mayExposeAvayaLaunchUrl(network)).toBe(false);
  });

  it("does not expose the Avaya launch URL for an untrusted IP even when observe mode permits the dashboard", () => {
    configureNetwork({ ADMIN_NETWORK_MODE: "observe", ADMIN_NETWORK_CIDRS: "203.0.113.18/32" });
    const network = evaluateAdminNetwork("admin", "198.51.100.7");

    expect(network).toMatchObject({ configured: true, detected: true, trusted: false, allowed: true });
    expect(mayExposeAvayaLaunchUrl(network)).toBe(false);
  });

  it("exposes the Avaya launch URL only after a trusted corporate-network decision", () => {
    configureNetwork({ ADMIN_NETWORK_MODE: "observe", ADMIN_NETWORK_CIDRS: "203.0.113.18/32" });
    const network = evaluateAdminNetwork("superadmin", "203.0.113.18");

    expect(network).toMatchObject({ required: true, configured: true, detected: true, trusted: true, allowed: true });
    expect(mayExposeAvayaLaunchUrl(network)).toBe(true);
  });

  it("accepts only complete project Queue or Skill forecast filters", () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    expect(parseForecastScopeRequest(new URL("https://example.com/api/call-center/operations"))).toEqual({ kind: "overall" });
    expect(parseForecastScopeRequest(new URL(`https://example.com/api/call-center/operations?projectId=${projectId}`))).toEqual({ kind: "project", projectId });
    expect(parseForecastScopeRequest(new URL(`https://example.com/api/call-center/operations?projectId=${projectId}&routingKind=queue&routingIdentifier=QUEUE-101`))).toEqual({
      kind: "queue", projectId, identifier: "queue-101",
    });
    expect(parseForecastScopeRequest(new URL("https://example.com/api/call-center/operations?routingKind=queue&routingIdentifier=queue-101"))).toBeNull();
    expect(parseForecastScopeRequest(new URL(`https://example.com/api/call-center/operations?projectId=${projectId}&routingKind=queue`))).toBeNull();
  });
});
