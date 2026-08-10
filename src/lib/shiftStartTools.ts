import {
  MAX_SHIFT_SECONDS,
  analyzeAvayaTimecardFile,
  durationToSeconds,
  type DurationEntry,
} from "./avayaReportProcessor";

export type NightCoverageStatus = "early" | "morning";

export type NightCoverageEmployee = {
  key: string;
  employeeId: string;
  name: string;
  shiftStartTimestamp: number | null;
  coverageEndTimestamp: number;
  coverageEndKind: "actual" | "projected";
  loggedInDurationSeconds: number;
  disconnectedDurationSeconds: number;
  hasOpenSession: boolean;
  status: NightCoverageStatus;
};

export type ShiftStartTimecardResult = Awaited<ReturnType<typeof analyzeAvayaTimecardFile>>;

export const analyzeShiftStartTimecard = analyzeAvayaTimecardFile;

const minutesOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

const nightSortMinutes = (timestamp: number) => {
  const minutes = minutesOfDay(timestamp);
  return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
};

export const projectedCoverageEnd = (entry: DurationEntry): { timestamp: number | null; kind: "actual" | "projected" } => {
  if (entry.hasOpenSession && entry.shiftStartTimestamp != null) {
    return {
      timestamp: entry.shiftStartTimestamp + (MAX_SHIFT_SECONDS + (entry.disconnectedDurationSeconds || 0)) * 1000,
      kind: "projected",
    };
  }
  return { timestamp: entry.shiftEndTimestamp ?? null, kind: "actual" };
};

export const buildNightCoverage = (entries: DurationEntry[], morningStartsAtHour = 5): NightCoverageEmployee[] => {
  const morningStart = Math.max(0, Math.min(10, Math.round(morningStartsAtHour))) * 60;
  return entries.flatMap((entry) => {
    const end = projectedCoverageEnd(entry);
    if (end.timestamp == null) return [];
    const endMinutes = minutesOfDay(end.timestamp);
    const isNightCoverage = endMinutes >= 22 * 60 || endMinutes < 10 * 60;
    if (!isNightCoverage) return [];
    return [{
      key: entry.key,
      employeeId: entry.employeeId,
      name: entry.name,
      shiftStartTimestamp: entry.shiftStartTimestamp ?? null,
      coverageEndTimestamp: end.timestamp,
      coverageEndKind: end.kind,
      loggedInDurationSeconds: entry.seconds,
      disconnectedDurationSeconds: entry.disconnectedDurationSeconds || 0,
      hasOpenSession: entry.hasOpenSession ?? false,
      status: endMinutes >= morningStart && endMinutes < 10 * 60 ? "morning" as const : "early" as const,
    }];
  }).sort((left, right) => nightSortMinutes(left.coverageEndTimestamp) - nightSortMinutes(right.coverageEndTimestamp));
};

export type AbandonedCall = {
  id: string;
  internalParty: string;
  externalParty: string;
  sourceEvent: string;
  answered: boolean;
  date: string;
  startTime: string;
  endTime: string;
  duration: string;
  durationSeconds: number;
};

export type AbandonedCallsReport = {
  rangeStart: string;
  rangeEnd: string;
  calls: AbandonedCall[];
};

export type MissedCallsFilterResult = {
  calls: AbandonedCall[];
  total: number;
  falseCalls: number;
  answeredRemoved: number;
  shortRemoved: number;
  invalidPhoneRemoved: number;
  duplicateRemoved: number;
  shortThresholdSeconds: number;
};

type PdfTextItem = { text: string; x: number; y: number };
type AbandonedPdfPage = { width: number; items: PdfTextItem[]; answeredYs: number[] };

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const CALL_ID_PATTERN = /^Call ID:\s*(\d+)/i;
const FULL_RANGE_PATTERN = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+[AP]M\b/i;

const pageLines = (page: AbandonedPdfPage) => {
  const sorted = [...page.items].filter((item) => normalizeText(item.text)).sort((a, b) => b.y - a.y || a.x - b.x);
  const grouped: Array<{ y: number; items: PdfTextItem[] }> = [];
  sorted.forEach((item) => {
    const current = grouped[grouped.length - 1];
    if (current && Math.abs(current.y - item.y) <= 2.75) {
      current.items.push(item);
      current.y = (current.y + item.y) / 2;
    } else {
      grouped.push({ y: item.y, items: [item] });
    }
  });
  return grouped.map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
};

const reportRange = (pages: AbandonedPdfPage[]) => {
  const dates: string[] = [];
  pages.forEach((page) => pageLines(page).forEach((line) => {
    const match = line.match(FULL_RANGE_PATTERN)?.[0];
    if (match && !dates.includes(match)) dates.push(match);
  }));
  return { rangeStart: dates[0] || "", rangeEnd: dates[1] || "" };
};

const cellText = (page: AbandonedPdfPage, anchorY: number, fromBaseX: number, toBaseX: number) => {
  const scale = page.width ? 792 / page.width : 1;
  return page.items
    .filter((item) => Math.abs(item.y - anchorY) <= 6.25)
    .filter((item) => item.x * scale >= fromBaseX && item.x * scale < toBaseX)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((item) => normalizeText(item.text))
    .filter(Boolean)
    .join(" ");
};

export const parseAbandonedCallsPages = (pages: AbandonedPdfPage[]): AbandonedCallsReport => {
  if (!pages.length) throw new Error("ملف المكالمات المفقودة لا يحتوي على صفحات قابلة للقراءة.");
  const firstText = pageLines(pages.slice(0, 1)[0]).join(" ");
  if (!/Abandoned\s+Calls/i.test(firstText)) throw new Error("الملف المختار ليس تقرير Abandoned Calls من Avaya.");

  const calls: AbandonedCall[] = [];
  pages.forEach((page) => {
    page.items.filter((item) => CALL_ID_PATTERN.test(normalizeText(item.text))).forEach((anchor) => {
      const id = normalizeText(anchor.text).match(CALL_ID_PATTERN)?.[1];
      if (!id) return;
      const sourceEvent = cellText(page, anchor.y, 485, 558);
      const duration = cellText(page, anchor.y, 716, 792);
      const hasAnsweredMark = page.answeredYs.some((y) => Math.abs(y - anchor.y) <= 7);
      calls.push({
        id,
        internalParty: cellText(page, anchor.y, 195, 266),
        externalParty: cellText(page, anchor.y, 266, 336),
        sourceEvent,
        answered: hasAnsweredMark || /\b(?:hold|live supervised|transfer)\b/i.test(sourceEvent),
        date: cellText(page, anchor.y, 577, 636),
        startTime: cellText(page, anchor.y, 636, 676),
        endTime: cellText(page, anchor.y, 676, 716),
        duration,
        durationSeconds: durationToSeconds(duration),
      });
    });
  });
  if (!calls.length) throw new Error("لم يتم العثور على سجلات Call ID داخل تقرير Abandoned Calls.");
  return { ...reportRange(pages), calls };
};

const numberFromArrayLike = (value: unknown, index: number) => {
  if (!value || typeof value !== "object") return NaN;
  const candidate = (value as Record<number, unknown>)[index];
  return typeof candidate === "number" ? candidate : Number(candidate);
};

const answeredPathYs = (operatorList: { fnArray: number[]; argsArray: unknown[][] }, constructPathOp: number, pageWidth: number) => {
  const scale = pageWidth ? 792 / pageWidth : 1;
  const ys: number[] = [];
  operatorList.fnArray.forEach((op, index) => {
    if (op !== constructPathOp) return;
    const bbox = operatorList.argsArray[index]?.[2];
    const x1 = numberFromArrayLike(bbox, 0) * scale;
    const y1 = numberFromArrayLike(bbox, 1);
    const x2 = numberFromArrayLike(bbox, 2) * scale;
    const y2 = numberFromArrayLike(bbox, 3);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;
    if (x1 >= 555 && x2 <= 575 && x2 - x1 <= 12 && y2 - y1 > 0 && y2 - y1 <= 12) ys.push((y1 + y2) / 2);
  });
  return ys;
};

export const loadAbandonedCallsPdf = async (file: File): Promise<AbandonedCallsReport> => {
  if (!file.name.toLocaleLowerCase("en").endsWith(".pdf")) throw new Error("تقرير المكالمات المفقودة يجب أن يكون PDF من Avaya.");
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("حجم ملف Abandoned Calls يتجاوز حد المعالجة الآمنة.");
  const [pdfjs, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
  let document: Awaited<typeof loadingTask.promise> | null = null;
  try {
    document = await loadingTask.promise;
    if (document.numPages > 100) throw new Error("ملف Abandoned Calls يتجاوز 100 صفحة.");
    const pages: AbandonedPdfPage[] = [];
    let totalItems = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
      const items: PdfTextItem[] = content.items.flatMap((item) => {
        if (!("str" in item) || !normalizeText(item.str)) return [];
        return [{ text: item.str, x: item.transform[4], y: item.transform[5] }];
      });
      totalItems += items.length;
      if (totalItems > 250_000) throw new Error("ملف Abandoned Calls يحتوي على بيانات تتجاوز حد المعالجة الآمنة.");
      pages.push({
        width: viewport.width,
        items,
        answeredYs: answeredPathYs(operators as unknown as { fnArray: number[]; argsArray: unknown[][] }, pdfjs.OPS.constructPath, viewport.width),
      });
    }
    return parseAbandonedCallsPages(pages);
  } catch (cause) {
    if (cause instanceof Error && /Abandoned|100 صفحة|حد المعالجة|Call ID/.test(cause.message)) throw cause;
    throw new Error(`تعذر قراءة ${file.name}. تأكد أنه تصدير PDF أصلي من تقرير Abandoned Calls.`);
  } finally {
    await document?.destroy();
    await loadingTask.destroy();
  }
};

const normalizePhone = (value: string) => {
  const local = value.trim().replace(/[\s\-()]/g, "");
  if (!/^\d+$/.test(local)) return "";
  if (/^5\d{8}$/.test(local)) return `0${local}`;
  return local;
};

export const normalizeSaudiMobileForFollowup = (value: string) => {
  const normalized = normalizePhone(value);
  return /^05\d{8}$/.test(normalized) ? normalized : "";
};

export const filterMissedCalls = (report: AbandonedCallsReport, shortThresholdSeconds = 30): MissedCallsFilterResult => {
  const threshold = Math.max(0, Math.round(shortThresholdSeconds));
  const falseCalls = report.calls.filter((call) => !call.answered);
  const longEnough = falseCalls.filter((call) => call.durationSeconds === 0 || call.durationSeconds >= threshold);
  const validPhones = longEnough.flatMap((call) => {
    const phone = normalizeSaudiMobileForFollowup(call.externalParty);
    return phone ? [{ ...call, externalParty: phone }] : [];
  });
  const seen = new Set<string>();
  const calls = validPhones.filter((call) => {
    if (seen.has(call.externalParty)) return false;
    seen.add(call.externalParty);
    return true;
  });
  return {
    calls,
    total: report.calls.length,
    falseCalls: falseCalls.length,
    answeredRemoved: report.calls.length - falseCalls.length,
    shortRemoved: falseCalls.length - longEnough.length,
    invalidPhoneRemoved: longEnough.length - validPhones.length,
    duplicateRemoved: validPhones.length - calls.length,
    shortThresholdSeconds: threshold,
  };
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const loadBrandLogo = async () => {
  try {
    const response = await fetch("/bhg-hospitality-group.jpg");
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
};

export const exportMissedCallsExcel = async (result: MissedCallsFilterResult, report: AbandonedCallsReport) => {
  const [{ default: ExcelRuntime }, logoBytes] = await Promise.all([import("exceljs"), loadBrandLogo()]);
  const workbook = new ExcelRuntime.Workbook();
  workbook.creator = "RES Dashboard";
  const sheet = workbook.addWorksheet("Missed Calls", { views: [{ state: "frozen", ySplit: 8 }] });
  sheet.mergeCells("A1:H4");
  if (logoBytes?.byteLength) {
    const imageId = workbook.addImage({ buffer: logoBytes as never, extension: "jpeg" });
    sheet.addImage(imageId, { tl: { col: 3.35, row: 0.05 }, ext: { width: 95, height: 95 } });
  }
  sheet.mergeCells("A5:H5");
  sheet.getCell("A5").value = "قائمة متابعة المكالمات المفقودة - الحجز المركزي";
  sheet.mergeCells("A6:H6");
  sheet.getCell("A6").value = `${report.rangeStart}${report.rangeEnd ? ` - ${report.rangeEnd}` : ""}`;
  sheet.mergeCells("A7:H7");
  sheet.getCell("A7").value = `FALSE: ${result.falseCalls} | النهائي: ${result.calls.length} | رقم غير صالح: ${result.invalidPhoneRemoved} | مكرر: ${result.duplicateRemoved} | قصير: ${result.shortRemoved}`;
  sheet.getRow(8).values = ["Call ID", "Internal Party", "External", "حالة المتابعة", "Answered", "Date", "Start Time", "Call Duration"];
  result.calls.forEach((call) => {
    const row = sheet.addRow([`Call ID: ${call.id}`, call.internalParty, call.externalParty, "", "FALSE", call.date, call.startTime, call.duration]);
    row.getCell(4).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"تم التواصل,لا يرد,مشغول,إعادة اتصال"'],
    };
  });
  sheet.columns = [{ width: 20 }, { width: 24 }, { width: 19 }, { width: 22 }, { width: 12 }, { width: 17 }, { width: 14 }, { width: 15 }];
  for (let rowNumber = 1; rowNumber <= 4; rowNumber += 1) sheet.getRow(rowNumber).height = 20;
  sheet.getRow(5).height = 30;
  sheet.getRow(6).height = 22;
  sheet.getRow(7).height = 22;
  sheet.getRow(8).height = 28;
  sheet.getCell("A5").font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A5").alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
  sheet.getCell("A5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF064E3B" } };
  ["A6", "A7"].forEach((address) => {
    sheet.getCell(address).font = { size: 9, color: { argb: "FF52645D" } };
    sheet.getCell(address).alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell(address).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F2E9" } };
  });
  sheet.getRow(8).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B2B2B" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  for (let rowNumber = 9; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 23;
    row.eachCell((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD9DEDC" } } };
    });
    row.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCC0000" } };
    row.getCell(5).font = { bold: true, color: { argb: "FF4B5563" } };
  }
  sheet.autoFilter = { from: "A8", to: `H${Math.max(8, sheet.rowCount)}` };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 } };
  sheet.headerFooter.oddFooter = "مجموعة بودل للضيافة - تقرير متابعة داخلي";
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "أ-متابعة.xlsx");
};

const asciiPdfText = (value: string) => value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
const clippedText = (value: string, limit: number) => {
  const text = asciiPdfText(value);
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 3))}...` : text;
};

export const createMissedCallsPdfBytes = async (
  result: MissedCallsFilterResult,
  report: AbandonedCallsReport,
  logoBytes?: Uint8Array,
) => {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = logoBytes?.byteLength ? await pdf.embedJpg(logoBytes) : null;
  const width = 612;
  const height = 792;
  const margin = 28;
  const columns = [90, 105, 80, 100, 52, 75, 54];
  const headers = ["Call", "Internal Party", "External", "Final Event", "Answered", "Date", "Start Time"];
  const rowsPerPage = 34;
  const pageCount = Math.max(1, Math.ceil(result.calls.length / rowsPerPage));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([width, height]);
    if (logo) page.drawImage(logo, { x: width / 2 - 44, y: 690, width: 88, height: 88 });
    page.drawText("Abandoned Calls - Central Reservation", { x: margin, y: 665, size: 14, font: bold, color: rgb(0.15, 0.15, 0.15) });
    page.drawText(asciiPdfText(report.rangeStart || "Avaya filtered report"), { x: margin, y: 650, size: 7.5, font: regular, color: rgb(0.3, 0.3, 0.3) });
    const tableTop = 626;
    let x = margin;
    headers.forEach((header, columnIndex) => {
      const cellWidth = columns[columnIndex];
      page.drawRectangle({ x, y: tableTop, width: cellWidth, height: 21, color: rgb(0.16, 0.16, 0.16) });
      page.drawText(header, { x: x + 4, y: tableTop + 7, size: 7, font: bold, color: rgb(1, 1, 1) });
      x += cellWidth;
    });

    const slice = result.calls.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    slice.forEach((call, rowIndex) => {
      const y = tableTop - 16 * (rowIndex + 1);
      const values = [
        `Call ID: ${call.id}`,
        clippedText(call.internalParty, 22),
        clippedText(call.externalParty, 16),
        "",
        "FALSE",
        clippedText(call.date, 14),
        clippedText(call.startTime, 10),
      ];
      x = margin;
      values.forEach((value, columnIndex) => {
        const cellWidth = columns[columnIndex];
        const isCall = columnIndex === 0;
        page.drawRectangle({
          x,
          y,
          width: cellWidth,
          height: 16,
          color: isCall ? rgb(0.8, 0, 0) : rowIndex % 2 ? rgb(0.965, 0.965, 0.965) : rgb(1, 1, 1),
          borderColor: rgb(0.72, 0.72, 0.72),
          borderWidth: 0.45,
        });
        if (value) page.drawText(value, { x: x + 3, y: y + 5, size: 6.3, font: isCall ? bold : regular, color: isCall ? rgb(1, 1, 1) : rgb(0.2, 0.2, 0.2) });
        x += cellWidth;
      });
    });
    page.drawLine({ start: { x: margin, y: 45 }, end: { x: width - margin, y: 45 }, thickness: 0.8, color: rgb(0.02, 0.31, 0.23) });
    page.drawText("Boudl Hospitality Group | Central Reservation | Internal Follow-up", { x: margin, y: 30, size: 6.5, font: regular, color: rgb(0.18, 0.32, 0.27) });
    page.drawText(`Page ${pageIndex + 1} / ${pageCount}`, { x: width - margin - 45, y: 30, size: 6.5, font: regular, color: rgb(0.35, 0.35, 0.35) });
  }
  return pdf.save();
};

export const exportMissedCallsPdf = async (result: MissedCallsFilterResult, report: AbandonedCallsReport) => {
  const logoBytes = await loadBrandLogo();
  const bytes = await createMissedCallsPdfBytes(result, report, logoBytes);
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), "أ.pdf");
};
