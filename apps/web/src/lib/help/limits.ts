/**
 * Per-user help limits: 5 questions a minute and 30 a day, on the shared token
 * bucket. In memory, so per server instance, like the sign-in start limit: a
 * brake on a runaway script or a stuck client, not a wall.
 */
import { RateLimiter } from "@/lib/rate-limiter";

export const HELP_PER_MINUTE = 5;
export const HELP_PER_DAY = 30;

export type HelpLimitResult = { ok: true } | { ok: false; window: "minute" | "day"; retryAfterSeconds: number };

export function createHelpLimiter(opts: { now?: () => number; maxUsers?: number; perMinute?: number; perDay?: number } = {}) {
  const perMinute = opts.perMinute ?? HELP_PER_MINUTE;
  const perDay = opts.perDay ?? HELP_PER_DAY;
  const maxUsers = opts.maxUsers ?? 5000;
  const buckets = new Map<string, { minute: RateLimiter; day: RateLimiter }>();
  return function allow(userId: string): HelpLimitResult {
    let b = buckets.get(userId);
    if (!b) {
      if (buckets.size >= maxUsers) buckets.delete(buckets.keys().next().value!);
      b = {
        minute: new RateLimiter({ ratePerSecond: perMinute / 60, capacity: perMinute, now: opts.now }),
        day: new RateLimiter({ ratePerSecond: perDay / 86_400, capacity: perDay, now: opts.now }),
      };
      buckets.set(userId, b);
    }
    // Check both before spending either, so a refused question costs nothing.
    const dayWait = b.day.waitTimeMs(1);
    if (dayWait > 0) return { ok: false, window: "day", retryAfterSeconds: Math.ceil(dayWait / 1000) };
    const minuteWait = b.minute.waitTimeMs(1);
    if (minuteWait > 0) return { ok: false, window: "minute", retryAfterSeconds: Math.ceil(minuteWait / 1000) };
    b.day.tryTake(1);
    b.minute.tryTake(1);
    return { ok: true };
  };
}

export function limitMessage(r: Extract<HelpLimitResult, { ok: false }>): string {
  return r.window === "day"
    ? `You have asked ${HELP_PER_DAY} questions today. Help opens again tomorrow. The setup guide at /setup.md has the steps.`
    : `That is ${HELP_PER_MINUTE} questions in a minute. Wait a minute, then ask again.`;
}
