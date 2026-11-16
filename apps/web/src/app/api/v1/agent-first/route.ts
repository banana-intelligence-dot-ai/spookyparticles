/**
 * GET /api/v1/agent-first: whether a break goes to your listening coding agent first.
 * POST {"on": true|false}: turn it on or off. On by default. With it on, the person is emailed
 * only when the agent has not fixed the break within 30 minutes. Every change is audited.
 */
import { ApiError, api, json } from "@/lib/http";
import { agentFirstEnabled, setAgentFirst } from "@/lib/agent-first";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json({ on: await agentFirstEnabled(actor.userId) });
});

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  const body = (await req.json().catch(() => null)) as { on?: unknown } | null;
  if (typeof body?.on !== "boolean") throw new ApiError(400, "bad_request", "Send {\"on\": true} or {\"on\": false}");
  return json({ on: await setAgentFirst(actor, body.on) });
});
