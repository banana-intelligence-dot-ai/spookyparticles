import { ApiError, api, json } from "@/lib/http";
import { moderate } from "@/lib/forum/store";
import { requireActor } from "@/lib/require-actor";

export const PATCH = api(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireActor(req, "write");
  const body = await req.json().catch(() => { throw new ApiError(400, "invalid_body", "Send JSON with a status."); });
  return json(await moderate(actor, (await ctx.params).id, body));
});
