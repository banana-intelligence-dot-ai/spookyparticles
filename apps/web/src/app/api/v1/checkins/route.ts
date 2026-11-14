/**
 * GET /api/v1/checkins: the user's check-in jobs with status and the ping link.
 *   ?status=down,late (any of new, never_checked_in, up, late, down, paused, retired), or ?status=issues
 *   for late, down and never checked in.
 * POST /api/v1/checkins { name, periodMinutes, graceMinutes?, project? }: a new job. Needs the
 * write scope: an agent with a read key cannot create alerts for its human.
 */
import { createJobFromBody } from "@/lib/checkin-create";
import { listJobs, parseStatusFilter } from "@/lib/checkins";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const raw = new URL(req.url).searchParams.get("status");
  const only = parseStatusFilter(raw);
  if (raw && !only) throw new ApiError(400, "status", "status: comma-separated new, never_checked_in, up, late, down, paused, retired, or issues");
  const jobs = await listJobs(actor.userId);
  return json({ jobs: only ? jobs.filter((j) => only.has(j.status)) : jobs });
});

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  const job = await createJobFromBody(actor, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  return json({ job, curl: `curl -fsS -m 10 --retry 3 "${job.pingUrl}"` }, { status: 201 });
});
