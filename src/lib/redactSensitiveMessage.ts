// Shared by browser and both server endpoints. Pattern redaction is a safety
// layer, not a guarantee: staff must still avoid entering personal data.
export const redactSensitiveMessage = (value: string): string => value
  .normalize("NFKC")
  .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
  .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)))
  .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[مفتاح محجوب]")
  .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[بيانات دخول محجوبة]")
  .replace(/\b(password|api[_ -]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[محجوب]")
  .replace(/((?:كلمة\s*(?:المرور|السر)|الرقم\s*السري)\s*[:=]?\s*)[^\s,;،]+/g, "$1[محجوب]")
  .replace(/((?:\botp\b|\bpin\b|\bcvv\b|\bcvc\b|verification\s*code|one[ -]time\s*(?:password|code)|رمز\s*(?:التحقق|التأكيد|التاكيد|الدخول|المصادقة)|كود\s*(?:التحقق|التأكيد|التاكيد)?)[^\d\n]{0,24})\d(?:[ -]?\d){2,7}(?!\d)/gi, "$1[رمز محجوب]")
  .replace(/(?<!\d)\d(?:[ -]?\d){2,7}(?!\d)(\s*(?:هو\s*)?(?:رمز\s*(?:التحقق|التأكيد|الدخول)|كود\s*التحقق|OTP\b|PIN\b))/gi, "[رمز محجوب]$1")
  .replace(/^(\s*)\d(?:[ -]?\d){3,5}(\s*)$/, "$1[رمز محجوب]$2")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد محجوب]")
  .replace(/[+\d][\d\s()-]{6,}\d/g, (candidate) => (
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.trim()) ? candidate
      : candidate.replace(/\D/g, "").length >= 8 ? "[رقم محجوب]" : candidate
  ));
