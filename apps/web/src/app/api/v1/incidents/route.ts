/**
 * GET /api/v1/incidents: what is broken right now, read from the hosts, for a person or
 * their coding agent to act on. Today: failed deployments, each with the line from the
 * build log that names the failure and the last lines of that log (Vercel), or the state
 * GitHub reported (other hosts). `?project=owner/repo` or `?project=name` narrows it.
 *
 * A call also keeps the hosts fresh: a Vercel resync starts when the last one is over
 * 5 minutes old, so an agent that calls this a few minutes after a push sees that push.
 */
import { api, json } from "@/lib/http";
import { incidentsFor } from "@/lib/incidents";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const url = new URL(req.url);
  return json(await incidentsFor(actor.userId, url.searchParams.get("project") ?? ""));
});
