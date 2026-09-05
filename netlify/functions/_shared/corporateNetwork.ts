import { isIP } from "node:net";
import type { UserRole } from "./userDirectory";

export type AdminNetworkMode = "off" | "observe" | "enforce";

export type AdminNetworkDecision = {
  mode: AdminNetworkMode;
  required: boolean;
  configured: boolean;
  detected: boolean;
  trusted: boolean;
  allowed: boolean;
  reason: "not-required" | "disabled" | "trusted" | "untrusted" | "missing-allowlist" | "missing-client-ip";
};

const env = (name: string) => (typeof Netlify === "undefined" ? "" : (Netlify.env.get(name) || "").trim());

const mode = (): AdminNetworkMode => {
  const value = env("ADMIN_NETWORK_MODE").toLocaleLowerCase("en");
  return value === "enforce" || value === "observe" ? value : "off";
};

const normalizeIp = (value: unknown) => {
  let ip = String(value || "").trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) ip = ip.slice(7);
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  return ip;
};

const ipv4Number = (value: string) => {
  if (isIP(value) !== 4) return null;
  return value.split(".").reduce((total, octet) => ((total << 8) | Number(octet)) >>> 0, 0) >>> 0;
};

const matchesRule = (clientIp: string, rule: string) => {
  const normalizedRule = normalizeIp(rule);
  if (!normalizedRule) return false;
  if (!normalizedRule.includes("/")) return clientIp.toLocaleLowerCase("en") === normalizedRule.toLocaleLowerCase("en");
  const [networkText, prefixText] = normalizedRule.split("/", 2);
  const network = ipv4Number(networkText);
  const client = ipv4Number(clientIp);
  const prefix = Number(prefixText);
  if (network === null || client === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (network & mask) === (client & mask);
};

const allowlist = () => env("ADMIN_NETWORK_CIDRS")
  .split(/[\s,;]+/)
  .map((entry) => entry.trim())
  .filter(Boolean);

export function evaluateAdminNetwork(role: UserRole, clientIpValue?: string): AdminNetworkDecision {
  const required = role === "admin" || role === "superadmin";
  const currentMode = mode();
  const rules = allowlist();
  const clientIp = normalizeIp(clientIpValue);
  const configured = rules.length > 0;
  const detected = isIP(clientIp) > 0;

  if (!required) return { mode: currentMode, required, configured, detected, trusted: true, allowed: true, reason: "not-required" };
  if (currentMode === "off") return { mode: currentMode, required, configured, detected, trusted: false, allowed: true, reason: "disabled" };
  if (!configured) return {
    mode: currentMode, required, configured, detected, trusted: false,
    allowed: currentMode !== "enforce", reason: "missing-allowlist",
  };
  if (!detected) return {
    mode: currentMode, required, configured, detected, trusted: false,
    allowed: currentMode !== "enforce", reason: "missing-client-ip",
  };
  const trusted = rules.some((rule) => matchesRule(clientIp, rule));
  return {
    mode: currentMode, required, configured, detected, trusted,
    allowed: currentMode !== "enforce" || trusted,
    reason: trusted ? "trusted" : "untrusted",
  };
}
