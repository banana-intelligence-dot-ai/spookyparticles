/** Change or remove one alert channel. */
import { cleanChannelProject, removeChannel, updateChannelProject } from "@/lib/alerts/channels";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const DELETE = api<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  if (!(await removeChannel(actor.userId, id, actor.label))) throw new ApiError(404, "not_found", "No such channel");
  return json({ deleted: id });
});

export const PATCH = api<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const body = (await req.json().catch(() => ({}))) as { project?: unknown };
  if (body.project === undefined || body.project !== null && typeof body.project !== "string") throw new ApiError(400, "project", "project: up to 120 characters or null");
  const { id } = await ctx.params;
  const channel = await updateChannelProject(actor.userId, id, cleanChannelProject(body.project), actor.label);
  if (!channel) throw new ApiError(404, "not_found", "No such channel");
  return json({ channel });
});
