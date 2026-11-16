/**
 * POST /api/v1/incidents/send {"project": "owner/repo", "what": "...", "jobId"?: "<job id>"}:
 * start the project's GitHub fix job now, instead of waiting for the pager. Needs a write key or
 * the web app. Refused when an agent already holds the break. Audited.
 */
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";
import { sendToAgent } from "@/lib/send-to-agent";

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  const body = await req.json().catch(() => null);
  return json(await sendToAgent(actor, body ?? {}));
});
