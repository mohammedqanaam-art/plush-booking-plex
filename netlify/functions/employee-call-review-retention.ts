import type { Config } from "@netlify/functions";
import { purgeExpiredCallReviews } from "./_shared/employeeWorkspace";

export default async () => {
  const result = await purgeExpiredCallReviews({ maxInspections: 1_000, maxDeletes: 800, maxBuckets: 48 });
  console.log("[employee-call-review-retention] completed", result);
};

export const config: Config = {
  schedule: "17 * * * *",
};
