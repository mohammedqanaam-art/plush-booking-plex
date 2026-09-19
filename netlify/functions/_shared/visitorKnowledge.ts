import { publicBranches, type PublicBranch } from "../../../src/data/publicBranches";

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

const normalizedBranch = (branch: PublicBranch) => ({
  ...branch,
  group: branch.brand,
  nameKey: normalize(branch.name),
  groupKey: normalize(branch.brand),
  cityKey: normalize(branch.city),
});

type IndexedBranch = ReturnType<typeof normalizedBranch>;
let hotBranchIndex: IndexedBranch[] | undefined;
let hotCities: string[] | undefined;

const getBranchIndex = () => {
  hotBranchIndex ??= publicBranches.map(normalizedBranch);
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

const branchEvidence = (branch: ReturnType<typeof branchMatch>) => branch
  ? `هوية فرع عامة: ${branch.name}\nالعلامة: ${branch.brand}\nالمدينة المسجلة: ${branch.city}\nالخدمات والأرقام والأسعار تُتحقق من المصدر الرسمي العام؛ لا يوجد وصول إلى الدليل التشغيلي.`
  : "";

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
  return {
    evidence: branchEvidence(branch),
    fastReply: null,
    locationSensitive,
    sources: branch ? [officialDirectorySource] : [],
  };
};
