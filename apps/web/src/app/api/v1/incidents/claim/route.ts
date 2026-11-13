/**
 * POST /api/v1/incidents/claim?project=owner/repo: an agent says it is fixing the project's
 * breaks, so other sessions leave them alone. 30 minutes; asking again renews it; a fix check
 * that answers "fixed" ends it. If another agent holds it, `claimed` is false and says who.
 * `?format=text` returns one line. Writes only to Spooky.
 */
import { claimBreak } from "@/lib/claims";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const POST = api(async (req) => {
  const actor = await requireActor(req);
  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim();
  if (!project || project.length > 120) throw new ApiError(400, "project_required", "Name the project: ?project=owner/repo");
  const result = await claimBreak(actor, project);
  if (url.searchParams.get("format") === "text") {
    return new Response(`${result.message}\n`, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return json(result);
});
