/**
 * Token bucket for Gmail's per-user quota: about 250 quota units per second per
 * user, 5 units per messages.get. Units refill continuously; a caller that asks
 * for more than is available waits exactly as long as the refill takes.
 *
 * One limiter per connection. Clock and sleep are injectable for tests.
 */
export type RateLimiterOptions = {
  /** Units added per second. */
  ratePerSecond: number;
  /** Maximum burst. Defaults to one second of units. */
  capacity?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export const GMAIL_UNITS_PER_SECOND = 250;
export const GMAIL_UNITS_PER_MESSAGE_GET = 5;
export const GMAIL_UNITS_PER_MESSAGE_LIST = 5;

export class RateLimiter {
  private tokens: number;
  private last: number;
  private readonly rate: number;
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<void> = Promise.resolve();

  constructor(opts: RateLimiterOptions) {
    if (opts.ratePerSecond <= 0) throw new Error("ratePerSecond must be positive");
    this.rate = opts.ratePerSecond;
    this.capacity = opts.capacity ?? opts.ratePerSecond;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.tokens = this.capacity;
    this.last = this.now();
  }

  private refill() {
    const t = this.now();
    const elapsed = Math.max(0, t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    this.last = t;
  }

  /** Milliseconds until `units` would be available, without consuming. */
  waitTimeMs(units: number): number {
    this.refill();
    if (this.tokens >= units) return 0;
    return Math.ceil(((units - this.tokens) / this.rate) * 1000);
  }

  /**
   * Consume `units` now if they are available, and say whether it did. Never waits: for
   * request limits that answer 429 instead of queueing. Do not mix with take() on one bucket.
   */
  tryTake(units: number): boolean {
    if (this.waitTimeMs(units) > 0) return false;
    this.tokens -= units;
    return true;
  }

  /**
   * Consume `units`, waiting if needed. Calls are served in order, so concurrent
   * callers cannot starve each other or overdraw the bucket.
   */
  take(units: number): Promise<void> {
    if (units > this.capacity) throw new Error(`request of ${units} exceeds capacity ${this.capacity}`);
    const run = async () => {
      for (;;) {
        const wait = this.waitTimeMs(units);
        if (wait === 0) {
          this.tokens -= units;
          return;
        }
        await this.sleep(wait);
      }
    };
    const next = this.queue.then(run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/**
 * Limiter for one workflow step. Stays 10% under the ceiling, and keeps the burst
 * small (ten messages) so back-to-back steps, each with a fresh bucket, cannot
 * add up to more than the per-user quota.
 */
export function gmailLimiter(overrides: Partial<RateLimiterOptions> = {}) {
  return new RateLimiter({
    ratePerSecond: GMAIL_UNITS_PER_SECOND * 0.9,
    capacity: GMAIL_UNITS_PER_MESSAGE_GET * 10,
    ...overrides,
  });
}
