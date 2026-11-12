/**
 * GET /api/v1/projects: every repo with its latest deployment per environment,
 * the subscriptions paying for it, recent notices from mail, open findings,
 * and a health word (failed, attention, ok, idle, archived, unknown).
 */
import { api, json } from "@/lib/http";
import { projectsFor } from "@/lib/projects";
import { requireActor } from "@/lib/require-actor";
import { resyncHostsQuietlyFor } from "@/lib/sync";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  // A read of the map keeps the hosts fresh: a Vercel resync starts when the last one is over 5 minutes old.
  await resyncHostsQuietlyFor(actor.userId);
  return json(await projectsFor(actor.userId));
});
