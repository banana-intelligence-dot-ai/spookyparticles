import { api, json } from "@/lib/http";
import { openFeedbackPr } from "@/lib/forum/pr";
import { requireActor } from "@/lib/require-actor";

export const POST = api(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(req, "write");
  return json(await openFeedbackPr(actor, (await ctx.params).id));
});
