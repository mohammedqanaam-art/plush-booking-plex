import { hotelBranches, type HotelBranch } from "../../../src/data/hotels";
import {
  HOTEL_INFORMATION_SHEET_URL,
  HOTEL_INFORMATION_SNAPSHOT_DATE,
  sheetOperationalHotels,
  type SheetOperationalHotel,
} from "../../../src/data/sheetOperationalData";

export type VisitorKnowledgeSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type VisitorKnowledge = {
  evidence: string;
  fastReply: string | null;
  locationSensitive: boolean;
  sources: VisitorKnowledgeSource[];
};

const OFFICIAL_HOTELS_URL = "https://boudl.com/ar/hotels";

const normalize = (value: string) => value
  .toLocaleLowerCase("ar")
  .normalize("NFKD")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/نارسيس/g, "نارسس")
  .replace(/قرطبه/g, "قرطبة")
  .replace(/الحمرا\b/g, "الحمراء")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const officialHotelUrl = (name: string, prefix = true) => {
  const slug = prefix ? `فندق-${name}` : name;
  return `https://boudl.com/ar/hotel/${encodeURIComponent(slug.replace(/\s+/g, "-"))}`;
};

const officialDirectorySource: VisitorKnowledgeSource = {
  title: "دليل فنادق مجموعة BHG الرسمي",
  url: OFFICIAL_HOTELS_URL,
  snippet: "الدليل الرسمي لفنادق بودل وعابر وبريرا ونارسس وزمن.",
};

const operationalSource: VisitorKnowledgeSource = {
  title: "دليل معلومات الفروع المعتمد",
  url: HOTEL_INFORMATION_SHEET_URL,
  snippet: `لقطة تشغيلية بتاريخ ${HOTEL_INFORMATION_SNAPSHOT_DATE}؛ المعلومات المتغيرة تُراجع قبل التأكيد.`,
};

const kingdomCentreSources = (): VisitorKnowledgeSource[] => [
  {
    title: "فندق بريرا العليا — الموقع الرسمي",
    url: officialHotelUrl("بريرا-العليا"),
    snippet: "تذكر صفحة الفندق الرسمية برج المملكة ضمن المعالم القريبة.",
  },
  {
    title: "فندق نارسس ذا رويال — الموقع الرسمي",
    url: officialHotelUrl("نارسس-ذا-رويال"),
    snippet: "تذكر صفحة الفندق الرسمية برج المملكة ضمن المعالم القريبة.",
  },
  {
    title: "بودل العليا — الموقع الرسمي",
    url: officialHotelUrl("بودل-العليا", false),
    snippet: "فرع مجموعة BHG في قلب حي العليا بالرياض.",
  },
];

const landmarkReply = (query: string): { reply: string; sources: VisitorKnowledgeSource[] } | null => {
  const text = normalize(query);
  if (!/(?:برج|مركز) المملكه|المملكه سنتر|kingdom (?:centre|center|tower)/i.test(text)) return null;

  return {
    reply: [
      "حول برج المملكة، الخيارات القريبة ضمن مجموعة BHG هي:",
      "• فندق بريرا العليا",
      "• فندق نارسس ذا رويال",
      "• بودل العليا",
      "",
      "لا أرتبها بمسافة رقمية من دون مسار خرائط حي؛ نقطة الدخول وحالة الطريق قد تغيّران الترتيب. اختر الفندق من المصادر الرسمية أدناه ثم قارن المسار في الخرائط.",
    ].join("\n"),
    sources: kingdomCentreSources(),
  };
};

const isLocationQuestion = (query: string) => /(?:اقرب|قريب|الموقع|موقعي|المسافه|كم يبعد|near(?:est)?|distance|location)/i.test(normalize(query));
const asksFromCurrentPosition = (query: string) => /(?:اقرب (?:فرع|فندق)?\s*(?:لي|مني)|موقعي الحالي|قريب مني|near me)/i.test(normalize(query));

const brandForQuery = (query: string) => {
  const text = normalize(query);
  if (/نارسس/.test(text)) return "نارسس";
  if (/بريرا|برايرا/.test(text)) return "بريرا";
  if (/عابر/.test(text)) return "عابر";
  if (/بودل/.test(text)) return "بودل";
  if (/زمن/.test(text)) return "زمن";
  return null;
};

const normalizedBranch = (branch: HotelBranch) => ({
  ...branch,
  nameKey: normalize(branch.name),
  groupKey: normalize(branch.group),
  cityKey: normalize(branch.city),
});

type IndexedBranch = ReturnType<typeof normalizedBranch>;
let hotBranchIndex: IndexedBranch[] | undefined;
let hotCities: string[] | undefined;
let hotOperationalByName: Map<string, SheetOperationalHotel> | undefined;

const getBranchIndex = () => {
  hotBranchIndex ??= hotelBranches.map(normalizedBranch);
  return hotBranchIndex;
};

const getCities = () => {
  hotCities ??= [...new Set(getBranchIndex().map((branch) => branch.cityKey))]
    .filter((city) => city.length >= 3)
    .sort((a, b) => b.length - a.length);
  return hotCities;
};

const branchMatch = (query: string) => {
  const text = normalize(query);
  const exact = getBranchIndex()
    .filter((branch) => text.includes(branch.nameKey))
    .sort((a, b) => b.nameKey.length - a.nameKey.length);
  if (exact.length) return exact[0];

  const suffixMatches = getBranchIndex().filter((branch) => {
    const suffix = branch.nameKey.split(" ").slice(1).join(" ");
    return suffix.length >= 4 && text.includes(suffix);
  });
  return suffixMatches.length === 1 ? suffixMatches[0] : null;
};

const operationalMatch = (branchName: string): SheetOperationalHotel | undefined => {
  const key = normalize(branchName);
  hotOperationalByName ??= new Map(sheetOperationalHotels.map((hotel) => [normalize(hotel.name), hotel]));
  return hotOperationalByName.get(key)
    || [...hotOperationalByName.entries()].find(([name]) => name === key || name.includes(key) || key.includes(name))?.[1];
};

const serviceQuestion = (query: string): { label: string; key: keyof SheetOperationalHotel } | null => {
  const text = normalize(query);
  const rules: Array<{ pattern: RegExp; label: string; key: keyof SheetOperationalHotel }> = [
    { pattern: /افطار|breakfast/, label: "الإفطار", key: "breakfast" },
    { pattern: /مسبح|pool/, label: "المسبح", key: "pool" },
    { pattern: /كوفي|مقهي|coffee/, label: "الكوفي شوب", key: "coffeeShop" },
    { pattern: /مطعم|restaurant/, label: "المطعم", key: "restaurant" },
    { pattern: /اطلاله|بلكون|view|balcony/, label: "الإطلالة أو الشرفة", key: "viewBalcony" },
    { pattern: /مواقف|parking/, label: "المواقف", key: "parking" },
    { pattern: /قاعه|اجتماع|meeting/, label: "القاعات", key: "meetingHall" },
    { pattern: /نادي|جيم|gym/, label: "النادي الرياضي", key: "gym" },
    { pattern: /مغسل|laundry/, label: "المغسلة", key: "laundry" },
    { pattern: /جلسات خارجي|outdoor/, label: "الجلسات الخارجية", key: "outdoorSeating" },
    { pattern: /سبا|spa/, label: "السبا", key: "spa" },
    { pattern: /جاكوزي|jacuzzi/, label: "الجاكوزي", key: "jacuzzi" },
    { pattern: /اطفال|kids/, label: "قسم الأطفال", key: "kidsSection" },
  ];
  return rules.find((rule) => rule.pattern.test(text)) || null;
};

const branchEvidence = (branch: ReturnType<typeof branchMatch>, operational?: SheetOperationalHotel) => {
  if (!branch) return "";
  const data = operational || branch;
  return [
    `سجل فرع منظم: ${branch.name}`,
    `العلامة: ${branch.group}`,
    `المدينة: ${branch.city}`,
    `الهاتف: ${branch.phone}`,
    `الإفطار: ${data.breakfast}`,
    `المسبح: ${data.pool}`,
    `المطعم: ${data.restaurant}`,
    `الكوفي شوب: ${data.coffeeShop}`,
    `الإطلالة/الشرفة: ${"viewBalcony" in data ? data.viewBalcony : data.balcony}`,
    `السبا: ${data.spa}`,
    `الجاكوزي: ${data.jacuzzi}`,
    `قسم الأطفال: ${data.kidsSection}`,
    `المغسلة: ${data.laundry}`,
    `الجلسات الخارجية: ${data.outdoorSeating}`,
  ].join("\n");
};

const generalServicesReply = (branch: NonNullable<ReturnType<typeof branchMatch>>, hotel: SheetOperationalHotel) => [
  `${branch.name} — أبرز المعلومات المسجلة:`,
  `• الإفطار: ${hotel.breakfast}`,
  `• المسبح: ${hotel.pool}`,
  `• المطعم: ${hotel.restaurant}`,
  `• الكوفي شوب: ${hotel.coffeeShop}`,
  `• المواقف: ${hotel.parking}`,
  `• النادي الرياضي: ${hotel.gym}`,
  `• السبا: ${hotel.spa}`,
  "",
  `هذه بيانات الدليل التشغيلي بتاريخ ${HOTEL_INFORMATION_SNAPSHOT_DATE}؛ الخدمة المتغيرة تُراجع مع الفندق قبل تأكيدها للضيف.`,
].join("\n");

const branchListReply = (query: string) => {
  const text = normalize(query);
  if (!/(?:فروع|الفروع|فنادق|قائمه)/.test(text)) return null;
  const city = getCities().find((candidate) => text.includes(candidate));
  if (!city) return null;
  const brand = brandForQuery(query);
  const matches = getBranchIndex().filter((branch) => branch.cityKey === city && (!brand || branch.groupKey === normalize(brand)));
  if (!matches.length) return null;

  const grouped = new Map<string, string[]>();
  for (const branch of matches) {
    const current = grouped.get(branch.group) || [];
    current.push(branch.name);
    grouped.set(branch.group, current);
  }
  const lines = [`الفروع المسجلة في ${matches[0].city}${brand ? ` لعلامة ${brand}` : " ضمن مجموعة BHG"}:`];
  for (const [group, names] of grouped) lines.push(`• ${group}: ${names.join("، ")}`);
  lines.push("", "للبحث عن الأقرب فعليًا، اكتب اسم الحي أو المعلم القريب منك.");
  return lines.join("\n");
};

export const buildVisitorKnowledge = (message: string): VisitorKnowledge => {
  const locationSensitive = isLocationQuestion(message);
  const landmark = landmarkReply(message);
  if (landmark) {
    return {
      evidence: "قاعدة موقع موثقة: بريرا العليا ونارسس ذا رويال تذكر صفحتاهما الرسميتان برج المملكة ضمن المعالم القريبة؛ بودل العليا خيار المجموعة في قلب العليا.",
      fastReply: landmark.reply,
      locationSensitive: true,
      sources: landmark.sources,
    };
  }

  if (asksFromCurrentPosition(message)) {
    return {
      evidence: "",
      fastReply: "حتى لا أخمّن موقعك: اكتب اسم الحي أو معلمًا قريبًا منك، وسأقارن لك فروع مجموعة BHG المناسبة. لا أستطيع اعتبار موقع الشبكة موقعًا دقيقًا للضيف.",
      locationSensitive: true,
      sources: [officialDirectorySource],
    };
  }

  const listReply = branchListReply(message);
  if (listReply) {
    return {
      evidence: "",
      fastReply: listReply,
      locationSensitive,
      sources: [officialDirectorySource],
    };
  }

  const branch = branchMatch(message);
  const operational = branch ? operationalMatch(branch.name) : undefined;
  if (branch && /(?:رقم|هاتف|اتصال|تواصل|phone|contact)/i.test(normalize(message))) {
    return {
      evidence: branchEvidence(branch, operational),
      fastReply: `${branch.name} — رقم الفندق المسجل: ${branch.phone}. للحجز المركزي يمكنك استخدام القناة الرسمية الظاهرة في الموقع.`,
      locationSensitive,
      sources: [officialDirectorySource],
    };
  }
  const service = branch && operational ? serviceQuestion(message) : null;
  if (branch && operational && service) {
    return {
      evidence: branchEvidence(branch, operational),
      fastReply: [
        `${branch.name} — ${service.label}: ${String(operational[service.key] || "غير محدد")}.`,
        "المعلومة من دليل الفروع التشغيلي؛ تحقّق من الفندق قبل الوعد إذا كانت الخدمة مرتبطة بالوقت أو حسب الإمكانية.",
      ].join("\n"),
      locationSensitive,
      sources: [operationalSource, officialDirectorySource],
    };
  }

  if (branch && operational && /(?:الخدمات|المرافق|متوفر|موجود|facilit)/i.test(normalize(message))) {
    return {
      evidence: branchEvidence(branch, operational),
      fastReply: generalServicesReply(branch, operational),
      locationSensitive,
      sources: [operationalSource, officialDirectorySource],
    };
  }

  return {
    evidence: branchEvidence(branch, operational),
    fastReply: null,
    locationSensitive,
    sources: branch ? [operationalSource, officialDirectorySource] : [],
  };
};
