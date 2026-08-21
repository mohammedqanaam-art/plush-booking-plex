export type BoudlAssistantScope = "greeting" | "in_scope" | "out_of_scope";

const normalize = (value: unknown) => String(value || "")
  .toLocaleLowerCase("ar")
  .normalize("NFKD")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const greetingPattern = /^(?:اهلا|اهلين|مرحبا|السلام عليكم|سلام|هلا|صباح الخير|مساء الخير|شكرا|شكرًا|thanks?|hello|hi|hey)[\s!.؟?]*$/i;
const brandPattern = /(?:^|\s)(?:bhg|boudl|braira|aber|narcissus|zamn|zaman|بودل|بريرا|برايرا|عابر|نارسيس|نارسس|زمن)(?=\s|$)/i;
const hospitalityPattern = /(?:^|\s)(?:فندق|فندقا|فنادق|فرع|فروع|حجز|حجوزات|غرف|غرفه|اجنحه|جناح|اقامه|ضيف|نزيل|وصول|مغادره|الغاء|الغاء الحجز|سياسه|خدمات|مرافق|مسبح|مطعم|افطار|سبا|نادي|مواقف|موقع|عنوان|رقم التواصل|رقم الفندق|سعر الغرفه|توفر الغرف|hotel|hotels|branch|branches|book|booking|reservation|room|suite|stay|guest|check in|check out|cancellation|facility|facilities|pool|restaurant|breakfast|spa|parking)(?=\s|$)/i;
const clearOutsidePattern = /(?:^|\s)(?:برمجه|كود|شفرة|جافاسكربت|بايثون|سياسه دوليه|رئيس|وزير|انتخابات|كره القدم|مباراه|دوري|اسهم|بورصه|ذهب|عملات|طب|دواء|تشخيص|مستشفي|طقس|اخبار|وصفه طبخ|قصيده|اغنيه|programming|javascript|python|politics|president|election|football|stocks?|crypto|medical|diagnosis|weather|news|recipe|poem|song)(?=\s|$)/i;
const followUpPattern = /^(?:هل|طيب|تمام|وماذا|ماذا عن|ايضا|كمان|وكم|وين|متي|كيف|ليش|نعم|لا|هذا|هذه|هناك)(?:\s|$)/i;

const hasScopeSignal = (value: string) => brandPattern.test(value) || hospitalityPattern.test(value);

export const classifyBoudlAssistantScope = (
  message: string,
  previousUserMessages: string[] = [],
): BoudlAssistantScope => {
  const current = normalize(message);
  if (!current || greetingPattern.test(current)) return "greeting";

  if (brandPattern.test(current)) return "in_scope";
  if (clearOutsidePattern.test(current)) return "out_of_scope";
  if (hospitalityPattern.test(current)) return "in_scope";

  const hasInScopeContext = previousUserMessages
    .slice(-4)
    .map(normalize)
    .some(hasScopeSignal);
  if (hasInScopeContext && followUpPattern.test(current)) return "in_scope";
  return "out_of_scope";
};

export const BHG_ASSISTANT_SCOPE = "bhg-hotels" as const;

export const boudlScopeReply = (scope: BoudlAssistantScope) => scope === "greeting"
  ? "أهلًا بك في مجموعة بودل للضيافة. أستطيع مساعدتك في فنادق بودل وبريرا وعابر ونارسيس وزمن: الفروع، المواقع، المرافق، السياسات العامة وطريقة الحجز."
  : "أختص فقط بفنادق مجموعة بودل للضيافة وخدماتها وحجوزاتها. اسألني عن بودل أو بريرا أو عابر أو نارسيس أو زمن، وسأساعدك من المصادر الرسمية.";
