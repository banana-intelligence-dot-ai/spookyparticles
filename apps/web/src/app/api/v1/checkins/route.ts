/**
 * GET /api/v1/checkins: the user's check-in jobs with status and the ping link.
 *   ?status=down,late (any of new, never_checked_in, up, late, down, paused, retired), or ?status=issues
 *   for late, down and never checked in.
 * POST /api/v1/checkins { name, periodMinutes, graceMinutes?, project? }: a new job. Needs the
 * write scope: an agent with a read key cannot create alerts for its human.
 */
import { cleanMinutes, cleanName, createJob, listJobs, parseStatusFilter } from "@/lib/checkins";
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
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = cleanName(body.name);
  if (!name) throw new ApiError(400, "name", "name: 2 to 80 characters");
  const periodMinutes = cleanMinutes(body.periodMinutes, null);
  if (!periodMinutes) throw new ApiError(400, "period", "periodMinutes: whole minutes, 1 to 44640");
  const graceMinutes = cleanMinutes(body.graceMinutes, Math.max(5, Math.min(60, Math.round(periodMinutes / 10))), 60 * 24 * 7);
  if (graceMinutes === null) throw new ApiError(400, "grace", "graceMinutes: whole minutes");
  const project = typeof body.project === "string" && body.project.trim() ? body.project.trim().slice(0, 120) : null;
  const job = await createJob({ userId: actor.userId, name, periodMinutes, graceMinutes, project, actor: actor.label });
  return json({ job, curl: `curl -fsS -m 10 --retry 3 "${job.pingUrl}"` }, { status: 201 });
});
