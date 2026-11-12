import { listConnectionsWithSync } from "@/lib/connections";
import { adoptQuietly } from "@/lib/github-connect";
import { api, json } from "@/lib/http";
import { readUnreadQuietly } from "@/lib/reading";
import { requireActor } from "@/lib/require-actor";
import { resyncHostsQuietlyFor } from "@/lib/sync";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  // Hosts: a Vercel resync starts when the last one is over 5 minutes old, so failures reach the map while someone looks.
  await resyncHostsQuietlyFor(actor.userId);
  // Links GitHub App installs the user made on GitHub directly, under any linked
  // GitHub account. Idempotent and throttled to once per 30 s per user.
  await adoptQuietly(actor.userId);
  const connections = await listConnectionsWithSync(actor.userId);
  // Inboxes with billing mail nobody has read yet get read. Throttled per inbox.
  // A backfill that has not written progress for 15 minutes counts as not running
  // (a dead run must not hold reading back for ever).
  const STALE_MS = 15 * 60_000;
  await readUnreadQuietly(
    connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      status: c.status,
      userId: actor.userId,
      syncRunning: Boolean(c.sync && !c.sync.finishedAt && Date.now() - new Date(c.sync.updatedAt).getTime() < STALE_MS),
    })),
  );
  return json({ connections });
});
