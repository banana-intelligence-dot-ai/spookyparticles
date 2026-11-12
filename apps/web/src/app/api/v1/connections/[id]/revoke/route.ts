import { getConnection, revokeConnection } from "@/lib/connections";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  const c = await getConnection(id, actor.userId).catch(() => null);
  if (!c) throw new ApiError(404, "not_found", "Connection not found");
  if (c.status === "revoked") return json({ revoked: { id: c.id, provider: c.provider, alreadyRevoked: true } });
  return json({ revoked: await revokeConnection(c, actor.label) });
});
