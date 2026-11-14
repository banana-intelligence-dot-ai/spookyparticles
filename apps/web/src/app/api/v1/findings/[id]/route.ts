/**
 * POST /api/v1/findings/{id} with { status: "confirmed" | "dismissed" | "open" }.
 * The user's verdict on a finding; "dismissed" is the "wrong?" button. The
 * verdict survives recomputes. Every change is audited.
 */
import { setFindingStatus } from "@/lib/findings-status";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  return json(await setFindingStatus(actor, id, body?.status));
});
