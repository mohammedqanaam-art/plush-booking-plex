const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const normalizedDigits = (value: string) => value.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit))).replace(/\D/g, "");

const luhnValid = (value: string) => {
  const digits = normalizedDigits(value);
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
};

const redactNumberCandidate = (candidate: string) => {
  const digits = normalizedDigits(candidate);
  const isSaudiMobile = /^(?:00966|966)?5\d{8}$/.test(digits) || /^05\d{8}$/.test(digits);
  const isSaudiIdentity = /^[12]\d{9}$/.test(digits);
  const isInternationalPhone = /^(?:\+|00)/.test(candidate.trim()) && digits.length >= 9 && digits.length <= 15;
  if (luhnValid(candidate)) return "[بيانات دفع محجوبة]";
  if (isSaudiMobile || isInternationalPhone) return "[هاتف محجوب]";
  if (isSaudiIdentity) return "[هوية محجوبة]";
  return candidate;
};

export const redactSensitiveText = (
  value: unknown,
  maxLength = 80_000,
  options: { redactAllPhoneLike?: boolean } = {},
) => {
  const redacted = String(value || "")
  // eslint-disable-next-line no-control-regex -- remove unsafe C0 controls while preserving tab/newline.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
  .replace(/\b(?:sk|pk|rk|sess)-[a-zA-Z0-9_-]{12,}\b/gi, "[مفتاح محجوب]")
  .replace(/\bBearer\s+[a-zA-Z0-9._~+/-]{12,}/gi, "Bearer [رمز محجوب]")
  .replace(/((?:password|passcode|كلمة\s*المرور|الرقم\s*السري)\s*[:=]?\s*)\S+/gi, "$1[سر محجوب]")
  .replace(/((?:otp|one[- ]?time\s*(?:password|code)|رمز\s*(?:التحقق|التأكيد|الدخول))\s*[:=]?\s*)[0-9٠-٩ -]{4,12}/gi, "$1[رمز محجوب]")
  .replace(/((?:cvv|cvc|رمز\s*الأمان)\s*[:=]?\s*)[0-9٠-٩]{3,4}/gi, "$1[رمز محجوب]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد محجوب]")
  .replace(/(?:\+|00)?[0-9٠-٩](?:[\s().-]*[0-9٠-٩]){7,18}/g, redactNumberCandidate);
  const phoneSafe = options.redactAllPhoneLike
    ? redacted.replace(/(?:\+|00)?[0-9٠-٩](?:[\s().-]*[0-9٠-٩]){6,18}/g, (candidate) => {
        const normalizedCandidate = candidate.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit))).trim();
        if (/^20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(normalizedCandidate)) return candidate;
        const digits = normalizedDigits(candidate);
        return digits.length >= 7 && digits.length <= 15 ? "[رقم محجوب]" : candidate;
      })
    : redacted;
  return phoneSafe.slice(0, Math.max(0, maxLength));
};
