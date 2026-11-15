/** One check-in job: read with recent pings, change period, grace, name, paused or retired, or delete it. */
import { deleteJob, getJob, recentPings } from "@/lib/checkins";
import { updateJobFromBody } from "@/lib/checkin-update";
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
  const job = await updateJobFromBody(actor, id, body);
  return json({ job });
});

export const DELETE = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  if (!(await deleteJob(actor.userId, id, actor.label))) throw new ApiError(404, "not_found", "No such job");
  return json({ deleted: id });
});
