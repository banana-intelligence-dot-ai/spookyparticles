/** One check-in job: read with recent pings, change period, grace, name, paused or retired, or delete it. */
import { cleanMinutes, cleanName, deleteJob, getJob, recentPings, updateJob } from "@/lib/checkins";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req);
  const { id } = await ctx.params;
  const job = await getJob(actor.userId, id);
  if (!job) throw new ApiError(404, "not_found", "No such job");
  return json({ job, pings: await recentPings(actor.userId, id) });
});

export const PATCH = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof updateJob>[2] = {};
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) throw new ApiError(400, "name", "name: 2 to 80 characters");
    patch.name = name;
  }
  if (body.periodMinutes !== undefined) {
    const p = cleanMinutes(body.periodMinutes, null);
    if (!p) throw new ApiError(400, "period", "periodMinutes: whole minutes, 1 to 44640");
    patch.periodMinutes = p;
  }
  if (body.graceMinutes !== undefined) {
    const g = cleanMinutes(body.graceMinutes, null, 60 * 24 * 7);
    if (g === null) throw new ApiError(400, "grace", "graceMinutes: whole minutes");
    patch.graceMinutes = g;
  }
  if (body.project !== undefined) patch.project = typeof body.project === "string" && body.project.trim() ? body.project.trim().slice(0, 120) : null;
  if (typeof body.paused === "boolean") patch.paused = body.paused;
  if (typeof body.retired === "boolean") patch.retired = body.retired;
  const job = await updateJob(actor.userId, id, patch, actor.label);
  if (!job) throw new ApiError(404, "not_found", "No such job");
  return json({ job });
});

export const DELETE = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  if (!(await deleteJob(actor.userId, id, actor.label))) throw new ApiError(404, "not_found", "No such job");
  return json({ deleted: id });
});
