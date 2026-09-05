import { describe, expect, it } from "vitest";
import { shouldBackupEmployeeWorkspaceKey } from "../../netlify/functions/_shared/employeeWorkspaceBackup";

describe("employee workspace backup boundaries", () => {
  it("never extends retention for legacy or current call reviews", () => {
    expect(shouldBackupEmployeeWorkspaceKey("call-reviews/2026-09-05-example")).toBe(false);
    expect(shouldBackupEmployeeWorkspaceKey("call-reviews-v2/8240000000000/example")).toBe(false);
    expect(shouldBackupEmployeeWorkspaceKey("maintenance/call-review-retention-buckets/123")).toBe(false);
  });

  it("keeps ordinary operational records eligible for backup", () => {
    expect(shouldBackupEmployeeWorkspaceKey("tasks/example")).toBe(true);
    expect(shouldBackupEmployeeWorkspaceKey("shifts/example")).toBe(true);
    expect(shouldBackupEmployeeWorkspaceKey("call-center-projects/example")).toBe(true);
  });
});
