/**
 * GET /api/v1/stats?days=30: site-wide usage counts per event and link tag, plus the funnel.
 * Counts only, no people. Admins only (SP_ADMIN_EMAILS); read it with an admin API key.
 */
import { isAdmin, usageStats } from "@/lib/analytics/usage";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  if (!(await isAdmin(actor.userId))) throw new ApiError(403, "admin_only", "Site-wide stats are for admins");
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 30) || 30, 1), 365);
  return json(await usageStats(days));
});
