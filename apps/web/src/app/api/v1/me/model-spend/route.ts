import { api, json } from "@/lib/http";
import { modelSpendSummary } from "@/lib/model-usage";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  return json({ unit: "cents", ...(await modelSpendSummary(actor.userId)) });
});
