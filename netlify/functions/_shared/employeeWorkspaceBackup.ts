import { getEncryptedEnvironmentStore } from "./storage";

const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const primaryStore = () => getEncryptedEnvironmentStore("employee-workspace", { consistency: "strong" });
const backupStore = () => getEncryptedEnvironmentStore("employee-workspace-backups", { consistency: "strong" });

export type EmployeeBackupManifest = {
  snapshotId: string;
  createdAt: string;
  recordCount: number;
  mode: "same-provider-encrypted";
};

const snapshotPrefix = (snapshotId: string) => `snapshots/${snapshotId}/`;
const manifestKey = (snapshotId: string) => `manifests/${snapshotId}`;
const validSnapshotId = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(value);
export const shouldBackupEmployeeWorkspaceKey = (key: string) => ![
  "call-reviews/",
  "call-reviews-v2/",
  "maintenance/call-review-retention-buckets/",
].some((prefix) => key.startsWith(prefix));

export async function createEmployeeWorkspaceBackup(now = new Date()): Promise<EmployeeBackupManifest> {
  const source = primaryStore();
  const destination = backupStore();
  const snapshotId = now.toISOString().replace(/[:.]/g, "-");
  let recordCount = 0;
  for await (const page of source.listPages()) {
    for (let index = 0; index < page.blobs.length; index += 20) {
      const keys = page.blobs.slice(index, index + 20).map((blob) => blob.key)
        .filter(shouldBackupEmployeeWorkspaceKey);
      await Promise.all(keys.map(async (key) => {
        const value = await source.get<unknown>(key, { type: "json" });
        if (value === null) return;
        await destination.setJSON(`${snapshotPrefix(snapshotId)}${key}`, { sourceKey: key, value });
        recordCount += 1;
      }));
    }
  }
  const manifest: EmployeeBackupManifest = {
    snapshotId,
    createdAt: now.toISOString(),
    recordCount,
    mode: "same-provider-encrypted",
  };
  await destination.setJSON(manifestKey(snapshotId), manifest);
  return manifest;
}

export async function listEmployeeWorkspaceBackups(): Promise<EmployeeBackupManifest[]> {
  const backups = backupStore();
  const manifests: EmployeeBackupManifest[] = [];
  for await (const page of backups.listPages({ prefix: "manifests/" })) {
    const values = await Promise.all(page.blobs.map((blob) => (
      backups.get<EmployeeBackupManifest>(blob.key, { type: "json" }).catch(() => null)
    )));
    manifests.push(...values.filter((value): value is EmployeeBackupManifest => Boolean(value)));
  }
  return manifests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function purgeExpiredEmployeeWorkspaceBackups(now = new Date()) {
  const backups = backupStore();
  const manifests = await listEmployeeWorkspaceBackups();
  const expired = manifests.filter((manifest) => Date.parse(manifest.createdAt) < now.getTime() - BACKUP_RETENTION_MS);
  let deletedSnapshots = 0;
  for (const manifest of expired) {
    for await (const page of backups.listPages({ prefix: snapshotPrefix(manifest.snapshotId) })) {
      await Promise.all(page.blobs.map((blob) => backups.delete(blob.key)));
    }
    await backups.delete(manifestKey(manifest.snapshotId));
    deletedSnapshots += 1;
  }
  return { deletedSnapshots };
}

export async function restoreMissingEmployeeWorkspaceRecords(snapshotId: string) {
  if (!validSnapshotId(snapshotId)) throw new Error("INVALID_SNAPSHOT_ID");
  const backups = backupStore();
  const primary = primaryStore();
  const manifest = await backups.get<EmployeeBackupManifest>(manifestKey(snapshotId), { type: "json" });
  if (!manifest) throw new Error("BACKUP_NOT_FOUND");
  let restored = 0;
  let existing = 0;
  for await (const page of backups.listPages({ prefix: snapshotPrefix(snapshotId) })) {
    for (const blob of page.blobs) {
      const record = await backups.get<{ sourceKey?: string; value?: unknown }>(blob.key, { type: "json" });
      const sourceKey = String(record?.sourceKey || "");
      if (!sourceKey || !shouldBackupEmployeeWorkspaceKey(sourceKey)) continue;
      if (await primary.get(sourceKey, { type: "json" }) !== null) {
        existing += 1;
        continue;
      }
      await primary.setJSON(sourceKey, record?.value);
      restored += 1;
    }
  }
  return { snapshotId, restored, existing };
}
