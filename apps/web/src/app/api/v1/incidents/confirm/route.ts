/**
 * POST /api/v1/incidents/confirm?project=owner/repo: an agent that thinks it fixed something
 * asks Spooky to check production. Spooky re-reads the hosts and answers fixed, still_broken,
 * waiting_on_run or checking (ask again in retryAfterSeconds). `?format=text` returns one short
 * block for a terminal. Writes only to Spooky (a fix.confirmed event); never to a host.
 */
import { recordInboxRead } from "@/lib/agent-listening";
import { confirmFix, formatFixCheckText } from "@/lib/confirm-fix";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const POST = api(async (req) => {
  const actor = await requireActor(req);
  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim();
  if (!project || project.length > 120) throw new ApiError(400, "project_required", "Name the project: ?project=owner/repo");
  const [check] = await Promise.all([confirmFix(actor, project), actor.apiKeyId ? recordInboxRead(actor.userId, actor.apiKeyId, project) : null]);
  if (url.searchParams.get("format") === "text") {
    return new Response(formatFixCheckText(check), { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return json(check);
});
