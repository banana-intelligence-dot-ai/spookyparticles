/**
 * Reading pipeline for one inbox (Tiers 1 to 3): every Tier 0
 * candidate not yet read goes through classify, extract and validate, then the
 * user's findings are recomputed. Started after the backfill's search phase
 * (first findings within minutes) and again when the full scan finishes.
 * Durable and resumable; batches are small so a crash loses little.
 */
import { READ_BATCH, finishReading, pendingMessageIds, readBatch, type ReadResult } from "./steps/receipts";

export type ReadInput = {
  connectionId: string;
  userId: string;
  /** Stop after this many messages (newest first). Default: everything unread. */
  maxMessages?: number;
};

export async function readReceipts(input: ReadInput) {
  "use workflow";
  const totals: ReadResult = { claimed: 0, receipts: 0, skipped: 0, failed: 0, retry: 0 };
  const max = input.maxMessages ?? Number.POSITIVE_INFINITY;
  // Rounds: each lists what is still unread, so a second run alongside this one is harmless.
  for (let round = 0; round < 40 && totals.claimed < max; round += 1) {
    const ids = await pendingMessageIds(input.connectionId, Math.min(500, max - totals.claimed));
    if (!ids.length) break;
    for (let i = 0; i < ids.length; i += READ_BATCH) {
      const r = await readBatch({ connectionId: input.connectionId, userId: input.userId, ids: ids.slice(i, i + READ_BATCH) });
      totals.claimed += r.claimed;
      totals.receipts += r.receipts;
      totals.skipped += r.skipped;
      totals.failed += r.failed;
      totals.retry += r.retry;
    }
  }
  return finishReading({ connectionId: input.connectionId, userId: input.userId, totals });
}
