import { agentViewFor } from "@/lib/agent-view";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const maxDuration = 60;

/** What an AI agent gets from each of your Vercel sites. Runs live, about 10 seconds at most. */
export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await agentViewFor(actor.userId));
});
