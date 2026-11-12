/** Remove one alert channel. Session only, like adding one. */
import { removeChannel } from "@/lib/alerts/channels";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const DELETE = api<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  if (actor.via !== "session") throw new ApiError(403, "session_required", "Remove alert channels from a signed-in session");
  const { id } = await ctx.params;
  if (!(await removeChannel(actor.userId, id))) throw new ApiError(404, "not_found", "No such channel");
  return json({ deleted: id });
});
