import { createHash, randomUUID } from "node:crypto";
import { getEnvironmentStore } from "./storage";

type QuotaEvent = {
  day: string;
  minute: string;
  units: number;
  updatedAt: string;
};

type QuotaPolicy = {
  namespace: "agents" | "call-reviews";
  units: number;
  minuteLimit: number;
  dailyLimit: number;
};

const store = () => getEnvironmentStore("employee-agent-quotas", { consistency: "strong" });

export async function consumeEmployeeQuota(userId: string, policy: QuotaPolicy): Promise<boolean> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const minute = now.toISOString().slice(0, 16);
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  const prefix = `${policy.namespace}/${owner}/${day}/`;
  const key = `${prefix}${minute.slice(11).replace(":", "-")}/${randomUUID()}`;
  const quotaStore = store();
  await quotaStore.setJSON(key, {
    day,
    minute,
    units: policy.units,
    updatedAt: now.toISOString(),
  } satisfies QuotaEvent);

  let dailyUnits = 0;
  let minuteUnits = 0;
  for await (const page of quotaStore.list({ prefix, paginate: true })) {
    for (let index = 0; index < page.blobs.length; index += 30) {
      const records = await Promise.all(page.blobs.slice(index, index + 30).map((blob) => (
        quotaStore.get(blob.key, { type: "json" }) as Promise<QuotaEvent | null>
      )));
      for (const record of records) {
        if (!record || record.day !== day) continue;
        const units = Number(record.units || 0);
        if (!Number.isFinite(units) || units <= 0) continue;
        dailyUnits += units;
        if (record.minute === minute) minuteUnits += units;
      }
    }
  }
  const accepted = dailyUnits <= policy.dailyLimit && minuteUnits <= policy.minuteLimit;
  if (!accepted) await quotaStore.delete(key).catch(() => undefined);
  return accepted;
}
