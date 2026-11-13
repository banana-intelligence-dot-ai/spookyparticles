/**
 * POST /api/v1/checks/{id}/take: an agent takes the one finding its person handed it (the
 * "Copy for my agent" words on Check). Same rules as /api/v1/checks/next; then report with
 * POST /api/v1/checks/{id}/report. Needs the "write" scope. Writes only to Spooky.
 */
import { takeNext } from "@/lib/checks/handoff-store";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };
export const POST = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found", "No such finding");
  return json(await takeNext(actor, false, id));
});
