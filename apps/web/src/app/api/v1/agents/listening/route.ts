/** GET /api/v1/agents/listening: which coding sessions hear about which projects, and broken projects nobody hears. */
import { listeningFor } from "@/lib/agent-listening";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  return json(await listeningFor(actor.userId));
});
