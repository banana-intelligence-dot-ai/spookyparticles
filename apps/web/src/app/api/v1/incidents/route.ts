/**
 * GET /api/v1/incidents: what is broken right now, read from the hosts, for a person or
 * their coding agent to act on. It includes failed deployments and check-in jobs that
 * failed, went quiet or never checked in. `?project=owner/repo` or `?project=name`
 * narrows it. `?format=text` returns a short agent-ready inbox. `claims` lists which agent is
 * fixing which project right now (see /api/v1/incidents/claim).
 *
 * A call also keeps the hosts fresh: a Vercel resync starts when the last one is over
 * 5 minutes old, so an agent that calls this a few minutes after a push sees that push.
 */
import { recordInboxRead } from "@/lib/agent-listening";
import { recordDeploys } from "@/lib/catches";
import { claimsFor } from "@/lib/claims";
import { api, json } from "@/lib/http";
import { formatIncidentsText, incidentsFor } from "@/lib/incidents";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const url = new URL(req.url);
  const project = url.searchParams.get("project") ?? "";
  const [report, claims] = await Promise.all([
    incidentsFor(actor.userId, project),
    claimsFor(actor.userId),
    // An agent asking about its project is how Today knows that session hears about it.
    actor.apiKeyId ? recordInboxRead(actor.userId, actor.apiKeyId, project) : null,
    // So a failure and its fix are written down even when nobody opens Today.
    recordDeploys(actor.userId),
  ]);
  if (url.searchParams.get("format") === "text") {
    return new Response(formatIncidentsText(report, project, url.origin, { claims, viewerKeyId: actor.apiKeyId ?? null }), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return json({ ...report, claims });
});
