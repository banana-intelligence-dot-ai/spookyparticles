import { api, json } from "@/lib/http";
import { ForumLimitError, markWorked } from "@/lib/forum/store";
import { requireActor } from "@/lib/require-actor";

export const POST = api(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(req, "write");
  try { return json(await markWorked(actor, (await ctx.params).id)); }
  catch (err) {
    if (err instanceof ForumLimitError) return json({ error: { code: err.code, message: err.message } }, { status: 429, headers: { "retry-after": String(err.retryAfterSeconds) } });
    throw err;
  }
});
