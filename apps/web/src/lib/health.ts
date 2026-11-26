/** Health of our own watcher, for a check that lives outside this product. Pure, so it is tested. */
import { DIGEST_HOUR_UTC } from "./alerts/digest";

export const WATCH_MAX_AGE_SECONDS = 15 * 60;

export type DigestHealth = "sent" | "empty" | "failed" | "not_yet" | "not_due";

type DigestRow = { sentAt: Date | null; payload?: unknown };

/** A send that expected numbers and carried none is "empty": a miss, not a success. */
function emptySend(row: DigestRow): boolean {
  const n = (row.payload as { numbers?: { fresh?: number; expected?: boolean } } | null)?.numbers;
  return Boolean(n?.expected) && n?.fresh === 0;
}

export function digestHealth(rows: DigestRow[], nowMs: number): DigestHealth {
  if (new Date(nowMs).getUTCHours() < DIGEST_HOUR_UTC + 1) return "not_due";
  if (!rows.length) return "not_yet";
  const sent = rows.filter((row) => row.sentAt !== null);
  if (!sent.length) return "failed";
  return sent.some(emptySend) ? "empty" : "sent";
}

export function watchHealth(beat: { lastRunAt: Date; lastOk: boolean } | null, nowMs: number) {
  if (!beat) return { ok: false, reason: "never_ran" as const, lastRunAt: null, ageSeconds: null };
  const ageSeconds = Math.max(0, Math.round((nowMs - beat.lastRunAt.getTime()) / 1000));
  const reason = ageSeconds > WATCH_MAX_AGE_SECONDS ? ("stale" as const) : beat.lastOk ? null : ("last_run_failed" as const);
  return { ok: reason === null, reason, lastRunAt: beat.lastRunAt.toISOString(), ageSeconds };
}
