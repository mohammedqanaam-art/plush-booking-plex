import type { BranchRecord } from "../../../src/data/knowledge";
import { HOTEL_INFORMATION_SHEET_URL } from "../../../src/data/sheetOperationalData";
import { normalizeKnowledgeText, type KnowledgeSyncStatus } from "../../../src/lib/knowledgeTypes";
import { operationsGuide } from "./operationsGuide";
import { protocolEntries } from "./protocolBank";

export type EmployeeKnowledgeSource = { title: string; url: string; snippet?: string };
const guideSource: EmployeeKnowledgeSource = { title: "الدليل التشغيلي BHG — مسودة 3.0 للاعتماد", url: "/workplace?section=calls" };
export const employeeGuideForModel = [operationsGuide.governance,
  ...protocolEntries.map((entry) => `${entry.title}\nالإجراء: ${entry.steps.join(" ")}\nالصياغة الإرشادية: ${entry.response}\nحدود الصلاحية: ${entry.caution}`)].join("\n\n");

export const branchForQuestion = (message: string, records: BranchRecord[]) => {
  const query = normalizeKnowledgeText(message).replace(/برايرا/g, "بريرا");
  const brand = /(?:^|\s)(بودل|بريرا|عابر|نارسيس|نارسس)(?:\s|$)/.exec(query)?.[1]?.replace("نارسس", "نارسيس");
  const candidates = records.filter((row) => {
    const name = normalizeKnowledgeText(row.branch).replace("نارسس", "نارسيس");
    if (brand && !name.startsWith(`${brand} `)) return false;
    const location = name.split(" ").slice(1).join(" ");
    return query.includes(name) || (location.length >= 3 && query.includes(location));
  });
  return candidates.length === 1 ? candidates[0] : null;
};

export function buildEmployeeKnowledge(message: string) {
  const complaint = /شكوى|شكوي|ضيف غاضب|تصعيد|complaint|escalat/i.test(message);
  const wedding = /عرسان|زفاف|honeymoon|wedding/i.test(message);
  const protocol = protocolEntries.find((entry) => entry.id === "complaint")!;
  let fastReply: string | null = null;
  if (wedding && !/(بودل|بريرا|عابر|نارسيس|نارسس)\s+\S+/.test(message)) {
    fastReply = "حدد اسم الفندق أو الفرع أولًا؛ تختلف باقات العرسان حسب الفرع، وسأراجع المعلومة في الشيت قبل إعطائك سعرًا.";
  } else if (complaint && normalizeKnowledgeText(message).split(" ").length <= 9) {
    fastReply = [`${protocol.title} — إرشاد من مسودة 3.0، والتنفيذ حسب آخر تعميم معتمد.`, ...protocol.steps.map((step, index) => `${index + 1}. ${step}`), `صياغة للضيف: «${protocol.response}»`, protocol.caution].join("\n\n");
  }
  return { fastReply, evidence: employeeGuideForModel, sources: [guideSource], hasLocalEvidence: true };
}

export function buildBranchKnowledge(message: string, records: BranchRecord[], sync: KnowledgeSyncStatus) {
  const row = branchForQuestion(message, records);
  if (!row) return { evidence: "", sources: [] as EmployeeKnowledgeSource[], fastReply: /عرسان|زفاف|honeymoon|wedding/i.test(message)
    ? "حدد اسم الفندق أو الفرع كاملًا للتحقق من باقات العرسان؛ لن أعتمد سعرًا عامًا للعلامة." : null };
  const fields: Array<[RegExp, string, string]> = [
    [/عرسان|زفاف|honeymoon|wedding/i, "بكج العرسان", row.hallPackages[1] || "غير محدد في الشيت"],
    [/افطار|إفطار|فطور|breakfast/i, "الإفطار", row.breakfastInfo], [/غداء|lunch/i, "الغداء", row.lunchInfo], [/عشاء|dinner/i, "العشاء", row.dinnerInfo],
    [/مسبح|سباحة|pool/i, "المسبح", row.poolInfo], [/موقف|مواقف|parking/i, "المواقف", row.parkingInfo],
    [/سبا|spa/i, "السبا", row.spaInfo], [/نادي|جيم|gym/i, "النادي", row.gymInfo],
    [/غرف|جناح|اجنحة|أجنحة|سرير|مساحة|room|suite/i, "الغرف", row.roomDetails?.map((room) => `${room.type} · مساحة الغرفة ${room.area || "غير محددة"} · ${room.description}`).join("\n") || row.roomTypes.join("\n")],
    [/قاعة|قاعات|hall/i, "القاعات", `${row.hallPackages[0] || "غير محدد"}\nتواصل القاعات: ${row.hallPhone}`],
    [/رقم|هاتف|اتصال|phone/i, "تواصل الفرع", row.receptionPhone],
  ];
  const matches = fields.filter(([pattern]) => pattern.test(message));
  const info = (matches.length ? matches : fields).map(([, label, value]) => `${label}: ${value}`).join("\n\n");
  const labels = (matches.length ? matches : fields).map(([, label]) => label);
  const sourceTabs = new Set<string>();
  for (const label of labels) {
    if (label === "تواصل الفرع") sourceTabs.add("أرقام الفنادق");
    else if (label !== "الغرف") sourceTabs.add("hotels data");
    if (["الإفطار", "الغداء", "العشاء"].includes(label)) sourceTabs.add("معلومات الوجبات بريرا");
    if (label === "القاعات") sourceTabs.add("ارقام القاعات");
  }
  const gids: Record<string, number> = { "hotels data": 966794486, "معلومات الوجبات بريرا": 1886079416, "ارقام القاعات": 272896145, "أرقام الفنادق": 2119886361 };
  const sources: EmployeeKnowledgeSource[] = [...sourceTabs].map((title) => ({
    title: `${title === "hotels data" ? "معلومات مرافق الفنادق" : title} — ${row.branch}`,
    url: sync.tabs.find((tab) => tab.title === title)?.url || `${HOTEL_INFORMATION_SHEET_URL}#gid=${gids[title]}`,
    snippet: sync.message,
  }));
  if (labels.includes("الغرف")) sources.push({ title: `دليل الغرف المرفق — ${row.branch}`, url: "/knowledge-bank", snippet: "أنواع الغرف ومساحاتها من المرفقات المحفوظة؛ لا تمثل إتاحة حية." });
  const freshness = `${sync.message}\nتاريخ النسخة المحفوظة: ${sync.snapshotDate}.`;
  const evidence = `الفرع: ${row.branch}\n${info}\n${freshness}\nمصادر الفرع: ${row.sourceFiles.filter((url) => url.startsWith("https://")).join(" ")}`;
  // A direct factual answer is useful without model credentials. Complex decisions stay with the model.
  const complex = /شكوى|شكوي|غاضب|تصعيد|يرفض|مشكلة|مشكله|مقارنة|قارن|تعويض|إلغاء|الغاء|complaint|compare/i.test(message);
  const fastReply = matches.length && !complex ? `${row.branch}\n\n${info}\n\n${freshness}\nالرد المقترح: «سأتحقق من تفاصيل الخدمة وسريان السعر لدى الفرع قبل تأكيدها لكم.»\nعند تعارض الشيت مع تعميم أحدث يُرجع للمشرف؛ هذه المعلومات لا تضمن الإتاحة أو السعر.` : null;
  return { fastReply, evidence, sources };
}
