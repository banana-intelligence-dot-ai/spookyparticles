/**
 * GET /api/v1/incidents: what is broken right now, read from the hosts, for a person or
 * their coding agent to act on. It includes failed deployments and check-in jobs that
 * failed, went quiet or never checked in. `?project=owner/repo` or `?project=name`
 * narrows it. `?format=text` returns a short agent-ready inbox.
 *
 * A call also keeps the hosts fresh: a Vercel resync starts when the last one is over
 * 5 minutes old, so an agent that calls this a few minutes after a push sees that push.
 */
import { api, json } from "@/lib/http";
import { formatIncidentsText, incidentsFor } from "@/lib/incidents";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const url = new URL(req.url);
  const project = url.searchParams.get("project") ?? "";
  const report = await incidentsFor(actor.userId, project);
  if (url.searchParams.get("format") === "text") {
    return new Response(formatIncidentsText(report, project, url.origin), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return json(report);
});
