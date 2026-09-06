import { createHash } from "node:crypto";
import { getEncryptedEnvironmentStore } from "./storage";
import type { UserRole } from "./security";

export type AccountRequest = {
  id: string; email: string; firstName: string; lastName: string; phone: string;
  passwordHash: string; status: "pending" | "approved" | "rejected" | "disabled";
  createdAt: string; reviewedAt?: string; reviewedBy?: string; role?: UserRole;
};
export const accountStore = () => getEncryptedEnvironmentStore("account-requests", { consistency: "strong" });
export const accountId = (email: string) => createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
export const getRegisteredAccount = (email: string) => accountStore().get<AccountRequest>(`account/${accountId(email)}`);
export const accountSummary = ({ passwordHash: _secret, ...record }: AccountRequest) => record;
export const normalizedPhone = (value: string) => value.normalize("NFKC")
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/[\s()-]/g, "");

export function validateRegistration(body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const phone = normalizedPhone(typeof body.phone === "string" ? body.phone : "");
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.");
  if (![firstName, lastName].every((name) => /^[\p{L}\p{M} '-]{1,60}$/u.test(name) && /\p{L}/u.test(name))) throw new Error("أدخل الاسم الأول واسم العائلة.");
  if (!/^\+?\d{9,15}$/.test(phone)) throw new Error("أدخل رقم جوال صحيحًا.");
  if (password.length < 12 || password.length > 128 || !password.trim()) throw new Error("اختر كلمة مرور من 12 إلى 128 حرفًا.");
  return { email, firstName, lastName, phone, password };
}
