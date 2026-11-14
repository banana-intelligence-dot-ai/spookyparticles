/**
 * GET /api/v1/activity?limit=100&since=ISO: notices and charges across every
 * inbox and vendor, newest first, plus deployments whose latest state failed.
 */
import { activityReport } from "@/lib/activity-report";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const url = new URL(req.url);
  return json(await activityReport(actor.userId, url.searchParams.get("limit") ?? 100, url.searchParams.get("since")));
});
