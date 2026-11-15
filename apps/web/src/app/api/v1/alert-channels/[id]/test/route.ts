/** POST: send one test notice to a single channel, so the owner sees it land before relying on it. */
import { testChannel } from "@/lib/alerts/channels";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  return json(await testChannel(actor, (await ctx.params).id));
});
