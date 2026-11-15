/**
 * DELETE /api/v1/api-keys/{id}: revoke a connected agent's key. The row stays
 * (name, when it was made, when it was last used) so the list keeps its history;
 * the key stops working at once.
 */
import { revokeApiKey } from "@/lib/api-keys";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "approve");
  const { id } = await ctx.params;
  return json({ apiKey: await revokeApiKey(actor, id) });
});
