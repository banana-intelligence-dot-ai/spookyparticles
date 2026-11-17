import { api, json } from "@/lib/http";
import { queue } from "@/lib/forum/store";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await queue(actor));
});
