/**
 * Start the reading pipeline for an inbox outside the backfill: the Read
 * endpoint, and the self-heal on the connections list (candidates exist that
 * nobody has read, for example inboxes synced before the pipeline shipped).
 */
import { and, count, eq, isNull } from "drizzle-orm";
import { start } from "workflow/api";
import { getDb, schema } from "@/db";
import type { Connection } from "@/db/schema";
import { readReceipts } from "@/workflows/read-receipts";
import { appendAudit } from "./audit";
import { ApiError } from "./http";

export async function unreadCount(connectionId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(schema.messages)
    .where(and(eq(schema.messages.connectionId, connectionId), isNull(schema.messages.readAt)));
  return Number(row?.n ?? 0);
}

export async function startReadingFor(
  c: Connection,
  actor: string,
  opts: { maxMessages?: number } = {},
): Promise<{ workflowRunId: string; unread: number; maxMessages: number | null }> {
  if (c.provider !== "gmail") throw new ApiError(400, "read_unsupported", "Reading applies to inboxes");
  if (c.status !== "active") throw new ApiError(409, "connection_inactive", "Connection is not active");
  const unread = await unreadCount(c.id);
  const maxMessages = opts.maxMessages && opts.maxMessages > 0 ? Math.floor(opts.maxMessages) : null;
  const wf = await start(readReceipts, [{ connectionId: c.id, userId: c.userId, ...(maxMessages ? { maxMessages } : {}) }]);
  await appendAudit({
    actor,
    userId: c.userId,
    action: "connection.read_started",
    target: `connection:${c.id}`,
    after: { workflowRunId: wf.runId, unread, maxMessages },
  });
  return { workflowRunId: wf.runId, unread, maxMessages };
}

/** Self-heal runs at most this often per inbox per server instance. */
const KICK_INTERVAL_MS = 5 * 60_000;

/**
 * Reading costs model tokens (well under a tenth of a cent per email on Haiku,
 * a few cents when an email escalates), so only inboxes with this many unread
 * candidates or fewer start on their own. Bigger backlogs wait for the user:
 * Sync, or POST /connections/{id}/read.
 */
export const READ_AUTO_LIMIT = Number(process.env.SP_READ_AUTO_LIMIT ?? 5000);
const lastKick = new Map<string, number>();

/**
 * For each active inbox with unread candidates and no backfill running, start
 * reading. Idempotent in effect: reading claims messages one at a time.
 */
export async function readUnreadQuietly(connections: { id: string; provider: string; status: string; userId: string; syncRunning: boolean }[]) {
  for (const c of connections) {
    if (c.provider !== "gmail" || c.status !== "active" || c.syncRunning) continue;
    const last = lastKick.get(c.id);
    if (last && Date.now() - last < KICK_INTERVAL_MS) continue;
    lastKick.set(c.id, Date.now());
    try {
      const unread = await unreadCount(c.id);
      if (unread === 0 || unread > READ_AUTO_LIMIT) continue;
      await start(readReceipts, [{ connectionId: c.id, userId: c.userId }]);
    } catch (err) {
      console.error("[read] self-heal failed", c.id, (err as Error).message);
    }
  }
}
