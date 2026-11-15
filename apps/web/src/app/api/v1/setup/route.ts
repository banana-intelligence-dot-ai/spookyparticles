/** GET /api/v1/setup: one safe summary for a new agent setting up Spooky. */
import { listJobs } from "@/lib/checkins";
import { listConnectionsFor } from "@/lib/connections-read";
import { api, json } from "@/lib/http";
import { incidentsFor } from "@/lib/incidents";
import { projectsFor } from "@/lib/projects";
import { requireActor } from "@/lib/require-actor";
import { formatSetupText, setupStatus } from "@/lib/setup-status";
import { resyncHostsQuietlyFor } from "@/lib/sync";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  const url = new URL(req.url);
  await resyncHostsQuietlyFor(actor.userId);
  const [connections, incidents, jobs, projects] = await Promise.all([
    listConnectionsFor(actor.userId),
    incidentsFor(actor.userId, ""),
    listJobs(actor.userId),
    projectsFor(actor.userId),
  ]);
  const status = setupStatus({ connections, incidents, jobs, projects }, url.origin);
  if (url.searchParams.get("format") === "text") {
    return new Response(formatSetupText(status), {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return json(status);
});
