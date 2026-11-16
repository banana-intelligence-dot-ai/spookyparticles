/**
 * POST /api/v1/checks/{id}/merge/decline {"note": "why"}: the agent did not merge a pull request
 * its person allowed, because a merge rule did not hold. The person sees the reason. Audited.
 */
import { declineAgentMerge } from "@/lib/checks/handoff-store";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };
export const POST = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const body = (await req.json().catch(() => null)) as { note?: unknown } | null;
  return json(await declineAgentMerge(actor, (await ctx.params).id, body?.note));
});
