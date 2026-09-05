import type { Config, Context } from "@netlify/functions";
import { getDeployStore, getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  analyzeAvayaWorkbookInputs,
  avayaTimestamp,
  normalizeAvayaEmployeeResult,
  parseAvayaWorkbookBytes,
  type AvayaFileKind,
  type AvayaReportResult,
} from "../../src/lib/avayaReportProcessor";
import type { CallCenterReportRoutingScope } from "../../src/lib/callCenterForecast";
import { json, validateSession } from "./_shared/security";

type UploadBody = {
  fileName?: string;
  contentBase64?: string;
  sha256?: string;
};

type SourceRecord = {
  kind: AvayaFileKind;
  fileName: string;
  sha256: string;
  size: number;
  uploadedAt: string;
};

type StagingManifest = {
  periodKey: string;
  rangeStart: string;
  rangeEnd: string;
  sources: Partial<Record<AvayaFileKind, SourceRecord>>;
};

export type StoredAvayaReport = AvayaReportResult & {
  reportId: string;
  syncedAt: string;
  sources: SourceRecord[];
  /** Set only by a validated Queue/Skill report ingestion path. */
  routingScope?: CallCenterReportRoutingScope;
};

export type AvayaReportRange = {
  reportId: string;
  from: string;
  to: string;
  rangeStart: string;
  rangeEnd: string;
  syncedAt: string;
  employeeCount: number;
};

const EXPECTED_KINDS: AvayaFileKind[] = ["inbound", "dnd", "timecard"];
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4_500_000;
const MAX_REPORT_RANGES = 180;
const STORE_NAME = "avaya_reports";
const CATALOG_KEY = "catalog";

function avayaStore(context: Context) {
  if (context.deploy.context === "production") {
    return getStore({ name: STORE_NAME, consistency: "strong" });
  }
  return getDeployStore({ name: STORE_NAME, deployID: context.deploy.id });
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function safeTokenEquals(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected || expected.length < 32) return false;
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

function syncToken(req: Request) {
  const header = req.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

function cleanFileName(value: unknown) {
  const unsafeCharacters = '\\/:*?"<>|';
  return Array.from(String(value || ""), (character) => (
    character.charCodeAt(0) <= 31 || unsafeCharacters.includes(character) ? "_" : character
  )).join("")
    .trim()
    .slice(0, 180);
}

function decodeBase64(value: unknown) {
  const encoded = String(value || "");
  if (!encoded || encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 8) return null;
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, "base64");
  return bytes.length > 0 && bytes.length <= MAX_FILE_BYTES ? bytes : null;
}

const isoUtcDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export function normalizeAvayaDate(value: unknown): string | null {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/)?.[1];
  if (iso) return iso;

  const avaya = avayaTimestamp(text);
  if (avaya !== null) return isoUtcDate(avaya);

  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? isoUtcDate(parsed) : null;
}

export function normalizeAvayaReportRange(
  report: Pick<AvayaReportResult, "rangeStart" | "rangeEnd" | "employees">,
) {
  const employeeStarts = report.employees.flatMap((employee) => (
    employee.shiftStartTimestamp === null || employee.shiftStartTimestamp === undefined
      ? []
      : [employee.shiftStartTimestamp]
  ));
  const employeeEnds = report.employees.flatMap((employee) => (
    employee.shiftEndTimestamp === null || employee.shiftEndTimestamp === undefined
      ? []
      : [employee.shiftEndTimestamp]
  ));
  const from = normalizeAvayaDate(report.rangeStart)
    || (employeeStarts.length ? isoUtcDate(Math.min(...employeeStarts)) : null);
  const to = normalizeAvayaDate(report.rangeEnd)
    || (employeeEnds.length ? isoUtcDate(Math.max(...employeeEnds)) : from);
  return from && to && from <= to ? { from, to } : null;
}

const reportRange = (report: StoredAvayaReport): AvayaReportRange | null => {
  const range = normalizeAvayaReportRange(report);
  if (!range) return null;
  return {
    reportId: report.reportId,
    ...range,
    rangeStart: report.rangeStart,
    rangeEnd: report.rangeEnd,
    syncedAt: report.syncedAt,
    employeeCount: report.employees.length,
  };
};

const validRequestedRange = (from: string | null, to: string | null) => Boolean(
  from
  && to
  && /^\d{4}-\d{2}-\d{2}$/.test(from)
  && /^\d{4}-\d{2}-\d{2}$/.test(to)
  && from <= to,
);

async function getCatalog(store: ReturnType<typeof avayaStore>) {
  const saved = (await store.get(CATALOG_KEY, { type: "json" })) as AvayaReportRange[] | null;
  if (Array.isArray(saved) && saved.length) return saved;

  try {
    const listed = await store.list({ prefix: "reports/" });
    const reportKeys = listed.blobs
      .map((blob) => blob.key)
      .filter((key) => key.startsWith("reports/"))
      .slice(0, MAX_REPORT_RANGES);
    const discovered: AvayaReportRange[] = [];
    for (let index = 0; index < reportKeys.length; index += 10) {
      const batch = await Promise.all(reportKeys.slice(index, index + 10).map(async (key) => {
        const report = (await store.get(key, { type: "json" })) as StoredAvayaReport | null;
        return report ? reportRange(report) : null;
      }));
      discovered.push(...batch.filter((item): item is AvayaReportRange => Boolean(item)));
    }
    const catalog = discovered
      .sort((left, right) => right.syncedAt.localeCompare(left.syncedAt))
      .slice(0, MAX_REPORT_RANGES);
    if (catalog.length) {
      await Promise.all([
        store.setJSON(CATALOG_KEY, catalog),
        ...catalog.map((range) => store.setJSON(`ranges/${range.from}__${range.to}`, { reportId: range.reportId })),
      ]);
    }
    return catalog;
  } catch {
    return [];
  }
}

async function indexReport(store: ReturnType<typeof avayaStore>, report: StoredAvayaReport) {
  const range = reportRange(report);
  if (!range) return;
  const catalog = await getCatalog(store);
  const next = [
    range,
    ...catalog.filter((item) => item.reportId !== report.reportId && !(item.from === range.from && item.to === range.to)),
  ]
    .sort((left, right) => right.syncedAt.localeCompare(left.syncedAt))
    .slice(0, MAX_REPORT_RANGES);
  await Promise.all([
    store.setJSON(CATALOG_KEY, next),
    store.setJSON(`ranges/${range.from}__${range.to}`, { reportId: report.reportId }),
  ]);
}

async function getLatest(req: Request, context: Context) {
  const session = await validateSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  if (session.role !== "admin" && session.role !== "superadmin") {
    return json({ error: "Forbidden" }, 403);
  }

  const store = avayaStore(context);
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from || to) && !validRequestedRange(from, to)) {
    return json({ error: "اختر تاريخ بداية ونهاية صحيحين." }, 400);
  }

  const latest = (await store.get("latest", { type: "json" })) as StoredAvayaReport | null;
  let report = latest;
  if (from && to) {
    const pointer = (await store.get(`ranges/${from}__${to}`, { type: "json" })) as { reportId?: string } | null;
    report = pointer?.reportId
      ? (await store.get(`reports/${pointer.reportId}`, { type: "json" })) as StoredAvayaReport | null
      : null;
    const latestRange = latest ? normalizeAvayaReportRange(latest) : null;
    if (!report && latest && latestRange?.from === from && latestRange.to === to) report = latest;
  }

  const normalizedReport = report ? {
    ...report,
    employees: report.employees.map(normalizeAvayaEmployeeResult),
  } : null;
  const savedCatalog = await getCatalog(store);
  const latestRange = latest ? reportRange(latest) : null;
  const availableRanges = savedCatalog.length
    ? savedCatalog
    : latestRange
      ? [latestRange]
      : [];
  return json({
    report: normalizedReport,
    availableRanges,
    selectedRange: report ? normalizeAvayaReportRange(report) : from && to ? { from, to } : null,
    sync: {
      configured: Boolean(Netlify.env.get("AVAYA_SYNC_KEY")),
      updatedAt: latest?.syncedAt || null,
    },
  });
}

async function uploadWorkbook(req: Request, context: Context) {
  const expectedToken = Netlify.env.get("AVAYA_SYNC_KEY");
  if (!safeTokenEquals(syncToken(req), expectedToken)) return json({ error: "Unauthorized" }, 401);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) return json({ error: "Request exceeds the upload limit" }, 413);

  let body: UploadBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const fileName = cleanFileName(body.fileName);
  if (!fileName || !fileName.toLocaleLowerCase("en").endsWith(".xlsx")) {
    return json({ error: "Only Avaya XLSX exports are accepted" }, 415);
  }

  const bytes = decodeBase64(body.contentBase64);
  if (!bytes) return json({ error: "Invalid or oversized workbook" }, 413);

  const fileHash = sha256(bytes);
  if (body.sha256 && (!/^[a-f0-9]{64}$/i.test(body.sha256) || body.sha256.toLocaleLowerCase("en") !== fileHash)) {
    return json({ error: "Workbook checksum mismatch" }, 400);
  }

  const store = avayaStore(context);
  const processed = (await store.get(`processed/${fileHash}`, { type: "json" })) as { reportId?: string } | null;
  if (processed?.reportId) {
    return json({ ok: true, duplicate: true, status: "processed", reportId: processed.reportId });
  }

  let parsed;
  try {
    parsed = await parseAvayaWorkbookBytes(new Uint8Array(bytes), fileName);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unsupported Avaya workbook" }, 422);
  }

  if (!parsed.rangeStart || !parsed.rangeEnd) {
    return json({ error: "The workbook does not contain a valid report period" }, 422);
  }

  const periodKey = sha256(`${parsed.rangeStart}|${parsed.rangeEnd}`);
  const manifestKey = `staging/${periodKey}/manifest`;
  const existing = (await store.get(manifestKey, { type: "json" })) as StagingManifest | null;
  const manifest: StagingManifest = existing || {
    periodKey,
    rangeStart: parsed.rangeStart,
    rangeEnd: parsed.rangeEnd,
    sources: {},
  };

  const previous = manifest.sources[parsed.kind];
  const waitingBefore = EXPECTED_KINDS.filter((kind) => !manifest.sources[kind]);
  if (previous?.sha256 === fileHash) {
    return json({
      ok: true,
      duplicate: true,
      status: "waiting",
      kind: parsed.kind,
      waitingFor: waitingBefore,
      rangeStart: manifest.rangeStart,
      rangeEnd: manifest.rangeEnd,
    }, 202);
  }

  const source: SourceRecord = {
    kind: parsed.kind,
    fileName,
    sha256: fileHash,
    size: bytes.length,
    uploadedAt: new Date().toISOString(),
  };
  manifest.sources[parsed.kind] = source;

  const workbookKey = `staging/${periodKey}/${parsed.kind}.xlsx`;
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  await store.set(workbookKey, arrayBuffer);
  await store.setJSON(manifestKey, manifest);

  const waitingFor = EXPECTED_KINDS.filter((kind) => !manifest.sources[kind]);
  if (waitingFor.length) {
    return json({
      ok: true,
      status: "waiting",
      kind: parsed.kind,
      waitingFor,
      rangeStart: manifest.rangeStart,
      rangeEnd: manifest.rangeEnd,
    }, 202);
  }

  try {
    const inputs = await Promise.all(EXPECTED_KINDS.map(async (kind) => {
      const data = await store.get(`staging/${periodKey}/${kind}.xlsx`, { type: "arrayBuffer" }) as ArrayBuffer | null;
      const record = manifest.sources[kind];
      if (!data || !record) throw new Error(`Missing staged ${kind} workbook`);
      return { name: record.fileName, bytes: new Uint8Array(data) };
    }));
    const report = await analyzeAvayaWorkbookInputs(inputs);
    const sources = EXPECTED_KINDS.map((kind) => manifest.sources[kind] as SourceRecord);
    const reportId = sha256(`${periodKey}|${sources.map((item) => item.sha256).join("|")}`);
    const stored: StoredAvayaReport = {
      ...report,
      reportId,
      syncedAt: new Date().toISOString(),
      sources,
    };

    await store.setJSON(`reports/${reportId}`, stored);
    await store.setJSON("latest", stored);
    await indexReport(store, stored);
    await Promise.all(sources.map((item) => store.setJSON(`processed/${item.sha256}`, { reportId, syncedAt: stored.syncedAt })));
    await Promise.all([
      ...EXPECTED_KINDS.map((kind) => store.delete(`staging/${periodKey}/${kind}.xlsx`)),
      store.delete(manifestKey),
    ]);

    return json({
      ok: true,
      status: "processed",
      reportId,
      syncedAt: stored.syncedAt,
      employees: stored.employees.length,
      rangeStart: stored.rangeStart,
      rangeEnd: stored.rangeEnd,
    }, 201);
  } catch (error) {
    console.error("Avaya report finalization failed", error);
    return json({ error: "Unable to finalize the Avaya report" }, 500);
  }
}

export default async (req: Request, context: Context) => {
  if (req.method === "GET") return getLatest(req, context);
  if (req.method === "POST") return uploadWorkbook(req, context);
  return json({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  path: "/api/avaya/sync",
  rateLimit: {
    windowSize: 60,
    windowLimit: 60,
    aggregateBy: ["ip"],
  },
};
