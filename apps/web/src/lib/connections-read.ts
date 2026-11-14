import { listConnectionsWithSync } from "@/lib/connections";
import { adoptQuietly } from "@/lib/github-connect";
import { readUnreadQuietly } from "@/lib/reading";
import { resyncHostsQuietlyFor } from "@/lib/sync";

/** The connections list the REST route and the MCP tool both return. */
export async function listConnectionsFor(userId: string) {
  // Hosts: a Vercel resync starts when the last one is over 5 minutes old, so failures reach the map while someone looks.
  await resyncHostsQuietlyFor(userId);
  // Links GitHub App installs the user made on GitHub directly, under any linked
  // GitHub account. Idempotent and throttled to once per 30 s per user.
  await adoptQuietly(userId);
  const connections = await listConnectionsWithSync(userId);
  // Inboxes with billing mail nobody has read yet get read. Throttled per inbox.
  // A backfill that has not written progress for 15 minutes counts as not running
  // (a dead run must not hold reading back for ever).
  const STALE_MS = 15 * 60_000;
  await readUnreadQuietly(
    connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      status: c.status,
      userId,
      syncRunning: Boolean(c.sync && !c.sync.finishedAt && Date.now() - new Date(c.sync.updatedAt).getTime() < STALE_MS),
    })),
  );
  return connections;
}
