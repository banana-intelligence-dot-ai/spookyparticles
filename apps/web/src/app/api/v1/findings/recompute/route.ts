/**
 * POST /api/v1/findings/recompute: rebuild the user's subscriptions, bill-to-repo
 * edges and findings from receipts now. Idempotent; verdicts on findings survive.
 */
import { recomputeFindings } from "@/lib/findings";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  return json(await recomputeFindings(actor.userId, actor.label), { status: 202 });
});
