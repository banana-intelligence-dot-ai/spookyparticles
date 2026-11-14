import { activityFor, failedDeployments } from "@/lib/projects";

/** Notices, charges and failed deployments. `limit` and `since` are the raw query values. */
export async function activityReport(userId: string, rawLimit: unknown, since: string | null) {
  const limit = Number(rawLimit ?? 100);
  const sinceMs = since ? Date.parse(since) : undefined;
  const [items, failed] = await Promise.all([
    activityFor(userId, { limit: Number.isFinite(limit) ? limit : 100, sinceMs: sinceMs && Number.isFinite(sinceMs) ? sinceMs : undefined }),
    failedDeployments(userId),
  ]);
  return { items, failedDeployments: failed };
}
