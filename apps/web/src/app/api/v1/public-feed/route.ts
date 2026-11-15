/**
 * GET /api/v1/public-feed: whether this account's fixes appear, anonymized, on the homepage feed.
 * POST {"on": true|false}: turn it on or off. Off by default. Every change is audited.
 */
import { ApiError, api, json } from "@/lib/http";
import { publicFeedEnabled, setPublicFeed } from "@/lib/public-fixes";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json({ on: await publicFeedEnabled(actor.userId) });
});

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  const body = (await req.json().catch(() => null)) as { on?: unknown } | null;
  if (typeof body?.on !== "boolean") throw new ApiError(400, "bad_request", "Send {\"on\": true} or {\"on\": false}");
  return json({ on: await setPublicFeed(actor, body.on) });
});
