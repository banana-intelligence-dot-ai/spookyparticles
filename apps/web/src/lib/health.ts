/** Health of our own watcher, for a check that lives outside this product. Pure, so it is tested. */
export const WATCH_MAX_AGE_SECONDS = 15 * 60;

export function watchHealth(beat: { lastRunAt: Date; lastOk: boolean } | null, nowMs: number) {
  if (!beat) return { ok: false, reason: "never_ran" as const, lastRunAt: null, ageSeconds: null };
  const ageSeconds = Math.max(0, Math.round((nowMs - beat.lastRunAt.getTime()) / 1000));
  const reason = ageSeconds > WATCH_MAX_AGE_SECONDS ? ("stale" as const) : beat.lastOk ? null : ("last_run_failed" as const);
  return { ok: reason === null, reason, lastRunAt: beat.lastRunAt.toISOString(), ageSeconds };
}
