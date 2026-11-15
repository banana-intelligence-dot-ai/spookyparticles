/** GET /api/v1/open: what is open right now, split into what is on you and what your agents have, each with what happened, the one next step and the keys that clear it. Plus the last few fixes. Reading also writes down deploy failures and fixes not seen yet (events table); nothing on a host changes. */
import { api, json } from "@/lib/http";
import { openItemsFor } from "@/lib/open-items";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await openItemsFor(actor.userId));
});
