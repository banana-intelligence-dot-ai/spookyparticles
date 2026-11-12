import { expirationsFor } from "@/lib/expirations/store";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await expirationsFor(actor.userId));
});
