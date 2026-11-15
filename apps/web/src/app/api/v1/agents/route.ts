/** GET /api/v1/agents: every agent key and what it did: the projects it asked about, what it holds now, the breaks fixed after it heard, and the broken projects no agent asked about. Never returns a key. Connect one with POST /api/v1/api-keys, revoke with DELETE /api/v1/api-keys/{id} (both from a signed-in session). */
import { agentsFor } from "@/lib/agents";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await agentsFor(actor.userId));
});
