import type {
  CallCenterProject,
  EmployeeCallReview,
  EmployeeQualityNote,
  EmployeeShift,
  EmployeeTask,
  EmployeeWorkspaceResource,
  EmployeeWorkspaceSnapshot,
  MarketingEngagement,
} from "../../../src/lib/employeeWorkspaceTypes";
import { callCenterProfileById } from "../../../src/lib/callCenterProfiles";
import { normalizeCallCenterForecastMapping } from "../../../src/lib/callCenterForecastScope";
import { createHash } from "node:crypto";
import { getEncryptedEnvironmentStore } from "./storage";
import { canonicalUsername } from "./userDirectory";

const store = () => getEncryptedEnvironmentStore("employee-workspace", { consistency: "strong" });

const prefixes = {
  tasks: "tasks/",
  shifts: "shifts/",
  qualityNotes: "quality-notes/",
  callReviews: "call-reviews/",
  callReviewsV2: "call-reviews-v2/",
  callReviewRetentionBuckets: "maintenance/call-review-retention-buckets/",
  marketingEngagements: "marketing-engagements/",
  callCenterProjects: "call-center-projects/",
} as const;

const cleanText = (value: unknown, maxLength: number) => String(value || "")
  .replace(/\p{Cc}/gu, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const CALL_REVIEW_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const REVERSE_TIMESTAMP_CEILING = 9_999_999_999_999;

type CallReviewRetentionBucket = {
  hourStart: number;
  recordPrefix: string;
  updatedAt: string;
};

const callReviewTimestampFromId = (id: string) => {
  const match = /^(\d{13})-[a-f0-9-]{20,80}$/i.exec(id);
  const timestamp = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(timestamp) ? timestamp : Number.NaN;
};

const callReviewBucket = (timestamp: number) => {
  const hourStart = Math.floor(timestamp / HOUR_MS) * HOUR_MS;
  const reverseHour = String(REVERSE_TIMESTAMP_CEILING - hourStart).padStart(13, "0");
  return {
    hourStart,
    markerKey: `${prefixes.callReviewRetentionBuckets}${hourStart}`,
    recordPrefix: `${prefixes.callReviewsV2}${reverseHour}/`,
  };
};

const callReviewStorageKey = (id: string) => {
  const timestamp = callReviewTimestampFromId(id);
  if (!Number.isFinite(timestamp)) return "";
  const reverseTimestamp = String(REVERSE_TIMESTAMP_CEILING - timestamp).padStart(13, "0");
  return `${callReviewBucket(timestamp).recordPrefix}${reverseTimestamp}-${id}`;
};

const marketingOwnerPrefix = (ownerId: string) => {
  const owner = createHash("sha256").update(cleanText(ownerId, 120)).digest("hex").slice(0, 24);
  return `${prefixes.marketingEngagements}${owner}/`;
};

const optionalDateTime = (value: unknown) => {
  const text = cleanText(value, 40);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const dateOnly = (value: unknown) => {
  const text = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
};

const timeOnly = (value: unknown) => {
  const text = cleanText(value, 5);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
};

const optionalRecordId = (value: unknown) => {
  const text = cleanText(value, 80);
  if (!text) return null;
  if (!/^[a-f0-9-]{20,80}$/i.test(text)) throw new Error("INVALID_PROJECT_ID");
  return text;
};

const cleanEmployeeList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const employees = new Map<string, string>();
  for (const candidate of value.slice(0, 100)) {
    const display = cleanText(candidate, 120);
    const canonical = canonicalUsername(display);
    if (display && canonical && !employees.has(canonical)) employees.set(canonical, display);
  }
  return [...employees.values()].slice(0, 50);
};

const cleanUserIdList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const userIds = new Set<string>();
  for (const candidate of value.slice(0, 100)) {
    const userId = cleanText(candidate, 120);
    if (userId) userIds.add(userId);
  }
  return [...userIds].slice(0, 50);
};

const cleanToolIds = (value: unknown, industry: CallCenterProject["industry"]) => {
  const allowed = new Set(callCenterProfileById(industry).tools.map((tool) => tool.id));
  if (!Array.isArray(value)) return [...allowed];
  return [...new Set(value
    .map((candidate) => cleanText(candidate, 80))
    .filter((candidate) => allowed.has(candidate)))]
    .slice(0, 32);
};

const cleanForecastMapping = (value: unknown) => normalizeCallCenterForecastMapping(
  value && typeof value === "object" && !Array.isArray(value)
    ? value as CallCenterProject["avayaForecastMapping"]
    : null,
);

export const isProjectAssignedToActor = (
  project: Pick<CallCenterProject, "assignedEmployees" | "assignedUserIds">,
  actor: string,
  actorUserId: string,
) => {
  if (Array.isArray(project.assignedUserIds)) {
    return Boolean(actorUserId) && project.assignedUserIds.some((userId) => userId === actorUserId);
  }
  return (project.assignedEmployees || [])
    .some((employee) => canonicalUsername(employee) === canonicalUsername(actor));
};

export const isFeedbackVisibleToActor = (
  record: Pick<EmployeeQualityNote | EmployeeCallReview, "employeeName" | "createdBy" | "createdByUserId" | "subjectUserId">,
  actor: string,
  actorUserId: string,
) => {
  if (typeof record.subjectUserId === "string" && record.subjectUserId.trim()) {
    return Boolean(actorUserId) && record.subjectUserId === actorUserId;
  }
  return (record.createdByUserId === actorUserId && canonicalUsername(record.createdBy) === canonicalUsername(actor))
    || canonicalUsername(record.employeeName) === canonicalUsername(actor);
};

type WorkspaceRecordFilter<T> = (value: T) => boolean;

async function listRecords<T>(
  prefix: string,
  limit: number | null,
  retentionMs = 0,
  filter?: WorkspaceRecordFilter<T>,
): Promise<T[]> {
  const workspace = store();
  const cutoff = retentionMs ? Date.now() - retentionMs : 0;
  const values: T[] = [];
  for await (const page of workspace.listPages({ prefix })) {
    for (let index = 0; index < page.blobs.length; index += 20) {
      const batch = await Promise.all(page.blobs.slice(index, index + 20).map((blob) => (
        workspace.get<T>(blob.key, { type: "json" }).catch(() => null)
      )));
      for (const value of batch) {
        if (!value) continue;
        if (retentionMs) {
          const createdAt = Date.parse(String((value as { createdAt?: string }).createdAt || ""));
          if (Number.isFinite(createdAt) && createdAt < cutoff) continue;
        }
        if (!filter || filter(value)) values.push(value);
      }
    }
  }
  const sorted = values
    .sort((left, right) => String((right as { updatedAt?: string; createdAt?: string }).updatedAt
      || (right as { createdAt?: string }).createdAt || "")
      .localeCompare(String((left as { updatedAt?: string; createdAt?: string }).updatedAt
        || (left as { createdAt?: string }).createdAt || "")));
  return limit === null ? sorted : sorted.slice(0, limit);
}

export const getCallCenterProjects = async () => (
  (await listRecords<CallCenterProject>(prefixes.callCenterProjects, null)).slice(0, 100)
);

export async function getEmployeeWorkspaceSnapshot(
  actor = "",
  reviewScope: "all" | "own" = "own",
  actorUserId = "",
): Promise<EmployeeWorkspaceSnapshot> {
  const canReviewAll = reviewScope === "all";
  const [allProjects, marketingRecords] = await Promise.all([
    getCallCenterProjects(),
    actorUserId ? listRecords<MarketingEngagement>(marketingOwnerPrefix(actorUserId), 250) : Promise.resolve([]),
  ]);
  const visibleProjects = canReviewAll
    ? allProjects
    : allProjects.filter((project) => isProjectAssignedToActor(project, actor, actorUserId));
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const taskVisible = (task: EmployeeTask) => task.projectId
    ? visibleProjectIds.has(task.projectId)
    : canonicalUsername(task.assignee) === canonicalUsername(actor)
      || canonicalUsername(task.createdBy) === canonicalUsername(actor);
  const shiftVisible = (shift: EmployeeShift) => shift.projectId
    ? visibleProjectIds.has(shift.projectId)
    : canonicalUsername(shift.employeeName) === canonicalUsername(actor)
      || canonicalUsername(shift.createdBy) === canonicalUsername(actor);
  const feedbackVisible = (record: EmployeeQualityNote | EmployeeCallReview) => (
    isFeedbackVisibleToActor(record, actor, actorUserId)
  );
  const [tasks, shifts, qualityNotes, modernCallReviews, legacyCallReviews] = await Promise.all([
    listRecords<EmployeeTask>(prefixes.tasks, 250, 0, canReviewAll ? undefined : taskVisible),
    listRecords<EmployeeShift>(prefixes.shifts, 250, 0, canReviewAll ? undefined : shiftVisible),
    listRecords<EmployeeQualityNote>(prefixes.qualityNotes, 150, 0, canReviewAll ? undefined : feedbackVisible),
    listRecords<EmployeeCallReview>(prefixes.callReviewsV2, 100, CALL_REVIEW_RETENTION_MS, canReviewAll ? undefined : feedbackVisible),
    listRecords<EmployeeCallReview>(prefixes.callReviews, 50, CALL_REVIEW_RETENTION_MS, canReviewAll ? undefined : feedbackVisible),
  ]);
  const callReviews = [...modernCallReviews, ...legacyCallReviews]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 50);
  return {
    tasks,
    shifts,
    qualityNotes,
    callReviews,
    marketingEngagements: marketingRecords,
    callCenterProjects: visibleProjects.slice(0, 100),
    generatedAt: new Date().toISOString(),
  };
}

export async function createWorkspaceRecord(
  resource: EmployeeWorkspaceResource,
  value: Record<string, unknown>,
  actor: string,
  actorUserId: string,
) {
  if (resource === "callReviews") throw new Error("UNSUPPORTED_RESOURCE_OPERATION");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const safeActor = cleanText(actor, 120);
  const safeActorUserId = cleanText(actorUserId, 120);
  let record: EmployeeTask | EmployeeShift | EmployeeQualityNote | MarketingEngagement | CallCenterProject;

  if (resource === "tasks") {
    const title = cleanText(value.title, 180);
    if (!title) throw new Error("TASK_TITLE_REQUIRED");
    const status = ["todo", "doing", "done"].includes(String(value.status)) ? value.status as EmployeeTask["status"] : "todo";
    const priority = ["low", "medium", "high", "urgent"].includes(String(value.priority))
      ? value.priority as EmployeeTask["priority"]
      : "medium";
    record = {
      id,
      projectId: optionalRecordId(value.projectId),
      title,
      description: cleanText(value.description, 1_500),
      assignee: cleanText(value.assignee, 120) || safeActor,
      status,
      priority,
      dueAt: optionalDateTime(value.dueAt),
      source: cleanText(value.source, 120) || "employee-hub",
      createdBy: safeActor,
      updatedBy: safeActor,
      createdAt: now,
      updatedAt: now,
    };
  } else if (resource === "shifts") {
    const date = dateOnly(value.date);
    const startTime = timeOnly(value.startTime);
    const endTime = timeOnly(value.endTime);
    if (!date || !startTime || !endTime) throw new Error("SHIFT_TIME_REQUIRED");
    record = {
      id,
      projectId: optionalRecordId(value.projectId),
      employeeName: cleanText(value.employeeName, 120) || safeActor,
      date,
      startTime,
      endTime,
      role: cleanText(value.role, 120) || "حجوزات",
      notes: cleanText(value.notes, 1_000),
      status: ["planned", "confirmed", "completed"].includes(String(value.status))
        ? value.status as EmployeeShift["status"]
        : "planned",
      createdBy: safeActor,
      updatedBy: safeActor,
      createdAt: now,
      updatedAt: now,
    };
  } else if (resource === "qualityNotes") {
    const employeeName = cleanText(value.employeeName, 120);
    const note = cleanText(value.note, 2_000);
    if (!employeeName || !note) throw new Error("QUALITY_NOTE_REQUIRED");
    const rawScore = value.score === null || value.score === "" ? null : Number(value.score);
    record = {
      id,
      employeeName,
      category: cleanText(value.category, 120) || "ملاحظة عامة",
      score: rawScore !== null && Number.isFinite(rawScore) ? Math.min(100, Math.max(0, Math.round(rawScore))) : null,
      note,
      callReviewId: cleanText(value.callReviewId, 80) || null,
      createdBy: safeActor,
      createdByUserId: safeActorUserId,
      subjectUserId: cleanText(value.subjectUserId, 120) || undefined,
      updatedBy: safeActor,
      createdAt: now,
      updatedAt: now,
    };
  } else if (resource === "marketingEngagements") {
    const clientName = cleanText(value.clientName, 160);
    const projectName = cleanText(value.projectName, 180);
    if (!clientName || !projectName) throw new Error("MARKETING_PROJECT_REQUIRED");
    const rawValue = value.value === null || value.value === "" ? null : Number(value.value);
    record = {
      id,
      clientName,
      projectName,
      serviceType: cleanText(value.serviceType, 160) || "استشارة وخطة تسويقية",
      contractReference: cleanText(value.contractReference, 160),
      contractStatus: ["draft", "agreed", "active", "completed"].includes(String(value.contractStatus))
        ? value.contractStatus as MarketingEngagement["contractStatus"]
        : "draft",
      status: ["lead", "proposal", "contracted", "executing", "completed"].includes(String(value.status))
        ? value.status as MarketingEngagement["status"]
        : "lead",
      value: rawValue !== null && Number.isFinite(rawValue) ? Math.max(0, Math.round(rawValue * 100) / 100) : null,
      currency: cleanText(value.currency, 8).toUpperCase() || "SAR",
      startDate: dateOnly(value.startDate),
      endDate: dateOnly(value.endDate),
      objective: cleanText(value.objective, 2_000),
      plan: cleanText(value.plan, 8_000),
      deliverables: cleanText(value.deliverables, 4_000),
      createdBy: safeActor,
      createdByUserId: safeActorUserId,
      updatedBy: safeActor,
      createdAt: now,
      updatedAt: now,
    };
    if (record.status === "executing" && !["agreed", "active"].includes(record.contractStatus)) {
      throw new Error("CONTRACT_REQUIRED_FOR_EXECUTION");
    }
  } else {
    const name = cleanText(value.name, 180);
    const clientName = cleanText(value.clientName, 180);
    if (!name || !clientName) throw new Error("CALL_CENTER_PROJECT_REQUIRED");
    const industries: CallCenterProject["industry"][] = ["general", "restaurant", "technology", "banking", "government"];
    const allowedChannels: CallCenterProject["channels"][number][] = ["voice", "email", "chat", "whatsapp"];
    const channels = Array.isArray(value.channels)
      ? [...new Set(value.channels.filter((channel): channel is CallCenterProject["channels"][number] => allowedChannels.includes(channel as CallCenterProject["channels"][number])))].slice(0, 4)
      : ["voice"];
    const serviceLevelSeconds = Math.round(Number(value.serviceLevelSeconds || 20));
    const targetAnswerRate = Number(value.targetAnswerRate || 0.8);
    const industry = industries.includes(value.industry as CallCenterProject["industry"])
      ? value.industry as CallCenterProject["industry"]
      : "general";
    record = {
      id,
      name,
      clientName,
      industry,
      channels: channels.length ? channels : ["voice"],
      serviceLevelSeconds: Number.isFinite(serviceLevelSeconds) ? Math.min(300, Math.max(5, serviceLevelSeconds)) : 20,
      targetAnswerRate: Number.isFinite(targetAnswerRate) ? Math.min(1, Math.max(0.5, targetAnswerRate)) : 0.8,
      operatingHours: cleanText(value.operatingHours, 160) || "حسب العقد",
      status: ["design", "pilot", "active", "paused"].includes(String(value.status))
        ? value.status as CallCenterProject["status"]
        : "design",
      assignedEmployees: cleanEmployeeList(value.assignedEmployees),
      assignedUserIds: cleanUserIdList(value.assignedUserIds),
      enabledToolIds: cleanToolIds(value.enabledToolIds, industry),
      avayaForecastMapping: cleanForecastMapping(value.avayaForecastMapping) || undefined,
      notes: cleanText(value.notes, 2_000),
      createdBy: safeActor,
      updatedBy: safeActor,
      createdAt: now,
      updatedAt: now,
    };
  }

  const prefix = resource === "marketingEngagements" ? marketingOwnerPrefix(safeActorUserId) : prefixes[resource];
  await store().setJSON(`${prefix}${id}`, record);
  return record;
}

export async function updateWorkspaceRecord(
  resource: EmployeeWorkspaceResource,
  id: string,
  changes: Record<string, unknown>,
  actor: string,
  actorUserId: string,
) {
  if (resource !== "tasks" && resource !== "shifts" && resource !== "marketingEngagements" && resource !== "callCenterProjects") throw new Error("UNSUPPORTED_RESOURCE_OPERATION");
  const safeId = cleanText(id, 80);
  if (!/^[a-f0-9-]{20,80}$/i.test(safeId)) throw new Error("INVALID_RECORD_ID");
  const workspace = store();
  const key = `${resource === "marketingEngagements" ? marketingOwnerPrefix(actorUserId) : prefixes[resource]}${safeId}`;
  const existing = await workspace.get<Record<string, unknown>>(key, { type: "json" });
  if (!existing) throw new Error("RECORD_NOT_FOUND");

  const next: Record<string, unknown> = { ...existing };
  if (resource === "tasks") {
    if (!["todo", "doing", "done"].includes(String(changes.status))) throw new Error("INVALID_RECORD_CHANGE");
    next.status = changes.status;
  } else if (resource === "shifts") {
    if (!["planned", "confirmed", "completed"].includes(String(changes.status))) throw new Error("INVALID_RECORD_CHANGE");
    next.status = changes.status;
  } else if (resource === "marketingEngagements") {
    if (existing.createdByUserId !== cleanText(actorUserId, 120)) throw new Error("RECORD_NOT_FOUND");
    let changed = false;
    if (changes.contractStatus !== undefined && ["draft", "agreed", "active", "completed"].includes(String(changes.contractStatus))) next.contractStatus = changes.contractStatus;
    if (changes.contractStatus !== undefined && next.contractStatus === changes.contractStatus) changed = true;
    if (changes.status !== undefined && ["lead", "proposal", "contracted", "executing", "completed"].includes(String(changes.status))) {
      next.status = changes.status;
      changed = true;
    }
    if (changes.plan !== undefined) {
      next.plan = cleanText(changes.plan, 8_000);
      changed = true;
    }
    if (!changed) throw new Error("INVALID_RECORD_CHANGE");
    if (next.status === "executing" && !["agreed", "active"].includes(String(next.contractStatus))) throw new Error("CONTRACT_REQUIRED_FOR_EXECUTION");
  } else {
    let changed = false;
    if (changes.status !== undefined && ["design", "pilot", "active", "paused"].includes(String(changes.status))) {
      next.status = changes.status;
      changed = true;
    }
    if (changes.assignedEmployees !== undefined || changes.assignedUserIds !== undefined) {
      next.assignedEmployees = cleanEmployeeList(changes.assignedEmployees);
      next.assignedUserIds = cleanUserIdList(changes.assignedUserIds);
      changed = true;
    }
    if (changes.enabledToolIds !== undefined) {
      next.enabledToolIds = cleanToolIds(changes.enabledToolIds, existing.industry as CallCenterProject["industry"]);
      changed = true;
    }
    if (changes.avayaForecastMapping !== undefined) {
      const mapping = cleanForecastMapping(changes.avayaForecastMapping);
      if (mapping) next.avayaForecastMapping = mapping;
      else delete next.avayaForecastMapping;
      changed = true;
    }
    if (!changed) throw new Error("INVALID_RECORD_CHANGE");
  }

  next.updatedBy = cleanText(actor, 120);
  next.updatedAt = new Date().toISOString();
  await workspace.setJSON(key, next);
  return next;
}

export async function deleteWorkspaceRecord(resource: EmployeeWorkspaceResource, id: string, actor = "", actorUserId = "") {
  const safeId = cleanText(id, 80);
  if (!/^[a-f0-9-]{20,80}$/i.test(safeId)) throw new Error("INVALID_RECORD_ID");
  const workspace = store();
  if (resource === "callReviews") {
    const modernKey = callReviewStorageKey(safeId);
    await Promise.all([
      modernKey ? workspace.delete(modernKey).catch(() => undefined) : Promise.resolve(),
      workspace.delete(`${prefixes.callReviews}${safeId}`).catch(() => undefined),
    ]);
    return;
  }
  const key = `${resource === "marketingEngagements" ? marketingOwnerPrefix(actorUserId) : prefixes[resource]}${safeId}`;
  if (resource === "marketingEngagements") {
    const existing = await workspace.get<MarketingEngagement>(key, { type: "json" });
    if (!existing || existing.createdByUserId !== cleanText(actorUserId, 120)) throw new Error("RECORD_NOT_FOUND");
  }
  await workspace.delete(key);
}

export async function saveCallReview(
  value: Omit<EmployeeCallReview, "id" | "createdAt">,
): Promise<EmployeeCallReview> {
  const timestamp = Date.now();
  const createdAt = new Date(timestamp).toISOString();
  const record: EmployeeCallReview = {
    ...value,
    id: `${String(timestamp).padStart(13, "0")}-${crypto.randomUUID()}`,
    createdAt,
  };
  const workspace = store();
  const bucket = callReviewBucket(timestamp);
  await workspace.setJSON(bucket.markerKey, {
    hourStart: bucket.hourStart,
    recordPrefix: bucket.recordPrefix,
    updatedAt: createdAt,
  } satisfies CallReviewRetentionBucket);
  await workspace.setJSON(callReviewStorageKey(record.id), record);
  return record;
}

export async function purgeExpiredCallReviews(options: {
  maxInspections?: number;
  maxDeletes?: number;
  maxBuckets?: number;
} = {}) {
  const workspace = store();
  const cutoff = Date.now() - CALL_REVIEW_RETENTION_MS;
  const maxInspections = Math.min(10_000, Math.max(20, options.maxInspections || 1_000));
  const maxDeletes = Math.min(5_000, Math.max(10, options.maxDeletes || 800));
  const maxBuckets = Math.min(168, Math.max(1, options.maxBuckets || 48));
  let inspected = 0;
  let deleted = 0;
  let completedBuckets = 0;
  const failures: string[] = [];

  const markers: CallReviewRetentionBucket[] = [];
  for await (const page of workspace.listPages({ prefix: prefixes.callReviewRetentionBuckets })) {
    for (const blob of page.blobs) {
      const hourStart = Number(blob.key.slice(prefixes.callReviewRetentionBuckets.length));
      if (!Number.isSafeInteger(hourStart) || hourStart < 0) continue;
      markers.push({
        hourStart,
        recordPrefix: callReviewBucket(hourStart).recordPrefix,
        updatedAt: "",
      });
    }
  }

  const eligibleBuckets = markers
    .filter((marker) => marker.hourStart <= cutoff)
    .sort((left, right) => left.hourStart - right.hourStart);

  let modernTruncated = false;
  for (const marker of eligibleBuckets.slice(0, maxBuckets)) {
    let bucketHasRemainingRecords = false;
    let bucketTruncated = false;
    for await (const page of workspace.listPages({ prefix: marker.recordPrefix })) {
      for (let index = 0; index < page.blobs.length; index += 20) {
        const keys = page.blobs.slice(index, index + 20).map((blob) => blob.key);
        const expiredKeys: string[] = [];
        for (const key of keys) {
          const id = key.split("-").slice(1).join("-");
          const timestampMatch = /-(\d{13})-[a-f0-9-]{20,80}$/i.exec(key);
          const timestamp = timestampMatch ? Number(timestampMatch[1]) : callReviewTimestampFromId(id);
          inspected += 1;
          if (!Number.isFinite(timestamp) || timestamp >= cutoff) {
            bucketHasRemainingRecords = true;
            continue;
          }
          if (deleted + expiredKeys.length >= maxDeletes) {
            bucketHasRemainingRecords = true;
            bucketTruncated = true;
            break;
          }
          expiredKeys.push(key);
        }
        if (expiredKeys.length) {
          const results = await Promise.allSettled(expiredKeys.map((key) => workspace.delete(key)));
          results.forEach((result, resultIndex) => {
            if (result.status === "fulfilled") deleted += 1;
            else {
              failures.push(expiredKeys[resultIndex]);
              bucketHasRemainingRecords = true;
            }
          });
        }
        if (bucketTruncated) break;
      }
      if (bucketTruncated) break;
    }
    if (!bucketHasRemainingRecords && !bucketTruncated) {
      await workspace.delete(`${prefixes.callReviewRetentionBuckets}${marker.hourStart}`);
      completedBuckets += 1;
    }
    if (bucketTruncated || deleted >= maxDeletes) {
      modernTruncated = true;
      break;
    }
  }
  if (eligibleBuckets.length > maxBuckets) modernTruncated = true;

  let legacyTruncated = false;
  for await (const page of workspace.listPages({ prefix: prefixes.callReviews })) {
    for (let index = 0; index < page.blobs.length; index += 20) {
      const keys = page.blobs.slice(index, index + 20).map((blob) => blob.key);
      if (inspected + keys.length > maxInspections || deleted >= maxDeletes) {
        legacyTruncated = true;
        break;
      }
      const batch = await Promise.all(keys.map(async (key) => ({
        key,
        value: await workspace.get<EmployeeCallReview>(key, { type: "json" }).catch(() => null),
      })));
      inspected += batch.length;
      const expiredKeys: string[] = [];
      for (const item of batch) {
        const createdAt = Date.parse(String(item.value?.createdAt || ""));
        if (!Number.isFinite(createdAt) || createdAt >= cutoff) continue;
        if (deleted + expiredKeys.length >= maxDeletes) {
          legacyTruncated = true;
          break;
        }
        expiredKeys.push(item.key);
      }
      if (expiredKeys.length) {
        const results = await Promise.allSettled(expiredKeys.map((key) => workspace.delete(key)));
        results.forEach((result, resultIndex) => {
          if (result.status === "fulfilled") deleted += 1;
          else failures.push(expiredKeys[resultIndex]);
        });
      }
      if (inspected >= maxInspections || deleted >= maxDeletes) {
        legacyTruncated = true;
        break;
      }
    }
    if (legacyTruncated) break;
  }
  if (failures.length) throw new Error(`CALL_REVIEW_RETENTION_DELETE_FAILED:${failures.length}`);
  return {
    inspected,
    deleted,
    completedBuckets,
    truncated: modernTruncated || legacyTruncated,
  };
}
