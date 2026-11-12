import { getConnection } from "@/lib/connections";
import { api, ApiError, json } from "@/lib/http";
import { startReadingFor } from "@/lib/reading";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/connections/{id}/read: read unread billing candidates in this
 * inbox now, newest first. Body { limit?: number } caps how many this run reads.
 */
export const POST = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  const c = await getConnection(id, actor.userId).catch(() => null);
  if (!c) throw new ApiError(404, "not_found", "Connection not found");
  const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
  const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : undefined;
  return json(await startReadingFor(c, actor.label, { maxMessages: limit }), { status: 202 });
});
