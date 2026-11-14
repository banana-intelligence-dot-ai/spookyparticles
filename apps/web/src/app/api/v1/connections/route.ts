import { listConnectionsFor } from "@/lib/connections-read";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  return json({ connections: await listConnectionsFor(actor.userId) });
});
