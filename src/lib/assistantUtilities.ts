import { classifyBoudlAssistantScope } from "./boudlAssistantScope";

export type AssistantUtility =
  | { kind: "reply"; reply: string; provider: "calculator" | "name-spelling" }
  | { kind: "name"; name: string };

const normalize = (text: string) => text.normalize("NFKC")
  .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\u0640]/g, "")
  .replace(/[\u064b-\u065f\u0670]/g, "")
  .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, (n) => String(n.charCodeAt(0) - 0x6f0))
  .replace(/٪/g, "%").replace(/٫/g, ".").replace(/٬/g, ",")
  .replace(/[−–]/g, "-").replace(/\s+/g, " ").trim();

// Decimal input is converted to integer cents; no expression evaluation or floating-point money arithmetic.
const cents = (value: string): bigint | null => {
  if (!/^(?:\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.replace(/,/g, "").split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const money = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
const calculation = (reply: string): AssistantUtility => ({ kind: "reply", reply, provider: "calculator" });

export function calculateAssistantAmount(message: string): AssistantUtility | null {
  const text = normalize(message).replace(/^احسب(?: لي)?\s+/u, "");
  if (text.length > 160 || !/\d/.test(text)) return null;
  const match = text.match(/^([\d.,]+)\s*(?:ريال|ر\.س|SAR)?\s*(خصم(?:\s+(?:بنسبة|نسبة|قيمة))?|ناقص|[-+×*÷/])\s*([\d.,]+)\s*(%|بالمئة|بالمائة|ريال|ر\.س|SAR)?$/i);
  if (!match) {
    if (/^-?[\d.,]+\s*(?:ريال\s*)?(?:خصم|[-+×*÷/])/.test(text)) {
      return calculation("اكتب العملية بوضوح، مثل: 2000 خصم 20%، أو 2000 خصم 20 ريال. استخدم رقمين فقط ومنزلتين عشريتين كحد أقصى.");
    }
    return null;
  }
  const [, first, operator, second, unit = ""] = match;
  const amount = cents(first);
  const value = cents(second);
  if (amount === null || value === null) return calculation("صيغة المبلغ غير صحيحة. مثال: 2000.50 خصم 20%.");
  const isDiscount = operator.startsWith("خصم") || operator === "-" || operator === "ناقص";
  const percent = /^(?:%|بالمئة|بالمائة)$/.test(unit) || (operator.startsWith("خصم") && !operator.includes("قيمة") && !unit);
  if ((operator.includes("قيمة") && percent) || (operator.includes("نسبة") && unit && !percent)) {
    return calculation("حدد نوع الخصم: 20% للنسبة أو 20 ريال للمبلغ الثابت.");
  }
  if (percent && !isDiscount) return calculation("لحساب خصم نسبة اكتب مثلًا: 2000 خصم 20%.");
  if (isDiscount) {
    if (percent && value > 10000n) return calculation("نسبة الخصم يجب أن تكون بين 0% و100%.");
    const discount = percent ? (amount * value + 5000n) / 10000n : value;
    if (discount > amount) return calculation("قيمة الخصم أكبر من المبلغ الأصلي. راجع الرقمين.");
    return calculation(`المبلغ بعد الخصم: ${money(amount - discount)}\nقيمة الخصم: ${money(discount)}${percent ? ` (${second.replace(/,/g, "")}%)` : " (مبلغ ثابت)"}\nالمبلغ الأصلي: ${money(amount)}`);
  }
  if ((operator === "/" || operator === "÷") && value === 0n) return calculation("لا يمكن القسمة على صفر.");
  const result = operator === "+" ? amount + value
    : operator === "*" || operator === "×" ? (amount * value + 50n) / 100n
      : (amount * 100n + value / 2n) / value;
  return calculation(`الناتج: ${money(result)}`);
}

const spellings: Record<string, string> = {
  محمد: "Mohammed", احمد: "Ahmed", محمود: "Mahmoud", حمد: "Hamad", حماد: "Hammad",
  علي: "Ali", عمر: "Omar", عمرو: "Amr", عثمان: "Othman", خالد: "Khalid", وليد: "Waleed",
  فهد: "Fahad", فيصل: "Faisal", سعود: "Saud", سعد: "Saad", سعيد: "Saeed", عبدالله: "Abdullah",
  عبدالرحمن: "Abdulrahman", عبدالعزيز: "Abdulaziz", عبدالاله: "Abdulilah", عبدالمجيد: "Abdulmajeed",
  عبدالكريم: "Abdulkarim", عبدالرزاق: "Abdulrazzaq", عبد: "Abdul", يوسف: "Yousef", ياسر: "Yasser",
  ابراهيم: "Ibrahim", اسماعيل: "Ismail", حسن: "Hassan", حسين: "Hussain", منصور: "Mansour",
  ناصر: "Nasser", ماجد: "Majed", راشد: "Rashid", راكان: "Rakan", عوض: "Awad", سلطان: "Sultan",
  بدر: "Badr", طلال: "Talal", تركي: "Turki", صالح: "Saleh", مازن: "Mazen",
  ساره: "Sarah", سارة: "Sarah", نوره: "Noura", نورة: "Noura", نور: "Noor", تهاني: "Tahani",
  فاطمه: "Fatimah", فاطمة: "Fatimah", مريم: "Maryam", عائشه: "Aisha", عائشة: "Aisha",
  امل: "Amal", اماني: "Amani", ريم: "Reem", هدى: "Huda", مها: "Maha", نوف: "Nouf",
  هند: "Hind", دلال: "Dalal", منى: "Mona", مشاعل: "Mashael", نجلاء: "Najla", هيفاء: "Haifa",
  الدوسري: "Al Dosari", القحطاني: "Al Qahtani", العتيبي: "Al Otaibi", الغامدي: "Al Ghamdi",
  الزهراني: "Al Zahrani", الحربي: "Al Harbi", الشمري: "Al Shammari", العنزي: "Al Anazi",
  المطيري: "Al Mutairi", السبيعي: "Al Subaie", الشهري: "Al Shehri", المالكي: "Al Malki",
  بن: "bin", بنت: "bint", ابو: "Abu", ال: "Al",
};
const nameKey = (name: string) => name.replace(/[أإآ]/g, "ا");
const nonNameWords = /(?:^|\s)(?:كيف|كم|هل|متى|وين|ماذا|ما|لماذا|ليش|لا|نعم|طيب|تمام|هذا|هذه|عن|عندي|احتاج|اريد|ابي|ابغى|اكتب|ترجم|اسم|بالانجليزي|برمجة|برمجه|كود|شفرة|شفره|سكريبت|جافاسكربت|بايثون|عدل|غير|تجاهل|تعليمات|التعليمات|الموقع|موقع|الاعدادات|اعدادات|كلمة|المرور|رمز|مفتاح|اسهم|بورصة|طقس|اخبار|سياسة|سياسه|دواء|طب|قصيدة|قصيده|اغنية|اغنيه|القدم|مباراة|مباراه|فروع|فنادق|تواصل|رقم|شكرا|اهلا|هلا|مرحبا)(?=\s|$)/;

export const formatNameSpelling = (spelling: string) => `${spelling}\nكتابة مقترحة للاسم بالإنجليزية؛ للحجز طابقها مع الهوية أو الجواز.`;

export function assistantUtility(message: string, previousUserMessages: string[] = []): AssistantUtility | null {
  if (message.length > 300) return null;
  const text = normalize(message);
  const amount = calculateAssistantAmount(text);
  if (amount) return amount;
  // Explicit name requests are extracted; only the name may reach the spelling endpoint.
  const explicit = text.match(/^(?:(?:اكتب|ترجم|حول)\s+(?:لي\s+)?(?:اسم\s+)?|اسم\s+)?([\u0621-\u063a\u0641-\u064a\s]+?)\s+(?:بالانجليزي|بالإنجليزي|بالإنجليزية|بالانجليزية|بالانقلش|انجلش|انجليزي|انجليزيه|انجليزية)$/u);
  const instruction = text.match(/^(?:ترجم|اكتب)\s+(?:لي\s+)?اسم\s+([\u0621-\u063a\u0641-\u064a\s]+)$/u);
  const candidate = (explicit?.[1] || instruction?.[1] || text).replace(/^اسم\s+/, "").trim();
  if (!/^[\u0621-\u063a\u0641-\u064a]+(?:\s+[\u0621-\u063a\u0641-\u064a]+){0,5}$/.test(candidate) || candidate.length > 100) return null;
  if (nonNameWords.test(nameKey(candidate))) return null;
  if (!explicit && !instruction && classifyBoudlAssistantScope(candidate, previousUserMessages) !== "out_of_scope") return null;
  const words = nameKey(candidate).replace(/عبد\s+(الله|الرحمن|العزيز|الاله|المجيد|الكريم|الرزاق)/g, "عبد$1").split(" ");
  const local = words.map((word) => spellings[word]);
  return local.every(Boolean)
    ? { kind: "reply", reply: formatNameSpelling(local.join(" ")), provider: "name-spelling" }
    : { kind: "name", name: candidate };
}
