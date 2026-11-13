/** GET /api/v1/catches: what Spooky caught in the last 30 days and when each was fixed. Reading also writes down deploy failures and fixes it has not seen yet (events table); nothing on a host changes. */
import { catchesFor } from "@/lib/catches";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  return json(await catchesFor(actor.userId));
});
