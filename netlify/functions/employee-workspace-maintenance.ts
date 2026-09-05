import type { Config } from "@netlify/functions";
import {
  createEmployeeWorkspaceBackup,
  purgeExpiredEmployeeWorkspaceBackups,
} from "./_shared/employeeWorkspaceBackup";

export default async () => {
  const backup = await createEmployeeWorkspaceBackup();
  const backupRetention = await purgeExpiredEmployeeWorkspaceBackups();
  console.log("[employee-workspace-maintenance] completed", {
    backupSnapshotId: backup.snapshotId,
    backupRecords: backup.recordCount,
    backupsDeleted: backupRetention.deletedSnapshots,
  });
};

export const config: Config = {
  schedule: "17 2 * * *",
};
