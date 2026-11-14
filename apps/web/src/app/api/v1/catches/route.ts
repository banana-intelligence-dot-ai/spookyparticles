/** GET /api/v1/catches: what Spooky caught in the last 30 days and when each was fixed, plus which agent holds which project right now (claims). Reading also writes down deploy failures and fixes it has not seen yet (events table); nothing on a host changes. */
import { catchesFor } from "@/lib/catches";
import { claimsFor } from "@/lib/claims";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const [catches, claims] = await Promise.all([catchesFor(actor.userId), claimsFor(actor.userId)]);
  return json({ ...catches, claims });
});
