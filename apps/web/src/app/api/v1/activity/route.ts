/**
 * GET /api/v1/activity?limit=100&since=ISO: notices and charges across every
 * inbox and vendor, newest first, plus deployments whose latest state failed.
 */
import { api, json } from "@/lib/http";
import { activityFor, failedDeployments } from "@/lib/projects";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const since = url.searchParams.get("since");
  const sinceMs = since ? Date.parse(since) : undefined;
  const [items, failed] = await Promise.all([
    activityFor(actor.userId, { limit: Number.isFinite(limit) ? limit : 100, sinceMs: sinceMs && Number.isFinite(sinceMs) ? sinceMs : undefined }),
    failedDeployments(actor.userId),
  ]);
  return json({ items, failedDeployments: failed });
});
