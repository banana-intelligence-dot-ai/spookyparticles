/**
 * GET /api/v1/me/marketing: whether this account said yes to product emails, and the address they go to.
 * PUT {"optIn": true|false}: answer or change it. Off unless the owner turns it on. Every change is audited.
 * Only the signed-in session or a key with the write scope can change it.
 */
import { ApiError, api, json } from "@/lib/http";
import { marketingFor, setMarketing } from "@/lib/marketing";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await marketingFor(actor.userId));
});

export const PUT = api(async (req) => {
  const actor = await requireActor(req, "write");
  const body = (await req.json().catch(() => null)) as { optIn?: unknown } | null;
  if (typeof body?.optIn !== "boolean") throw new ApiError(400, "bad_request", "Send {\"optIn\": true} or {\"optIn\": false}");
  return json(await setMarketing(actor, body.optIn));
});
