import { describe, expect, it } from "vitest";
import { GMAIL_UNITS_PER_MESSAGE_GET, GMAIL_UNITS_PER_SECOND, RateLimiter } from "./rate-limiter";

function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
    get t() {
      return t;
    },
  };
}

describe("RateLimiter", () => {
  it("allows a burst up to capacity without waiting", async () => {
    const c = fakeClock();
    const rl = new RateLimiter({ ratePerSecond: 250, now: c.now, sleep: c.sleep });
    for (let i = 0; i < 50; i++) await rl.take(GMAIL_UNITS_PER_MESSAGE_GET);
    expect(c.sleeps).toEqual([]);
  });

  it("waits for refill once the bucket is empty", async () => {
    const c = fakeClock();
    const rl = new RateLimiter({ ratePerSecond: 250, now: c.now, sleep: c.sleep });
    await rl.take(250);
    await rl.take(5); // needs 5 units at 250/s = 20ms
    expect(c.sleeps).toEqual([20]);
  });

  it("holds 100 message fetches to the per-user Gmail quota", async () => {
    const c = fakeClock();
    const rl = new RateLimiter({ ratePerSecond: GMAIL_UNITS_PER_SECOND, now: c.now, sleep: c.sleep });
    // 100 messages * 5 units = 500 units; 250 burst + 250 refilled over 1s.
    await Promise.all(Array.from({ length: 100 }, () => rl.take(GMAIL_UNITS_PER_MESSAGE_GET)));
    expect(c.t).toBeGreaterThanOrEqual(1000);
    expect(c.t).toBeLessThan(1100);
  });

  it("refills with elapsed time and never above capacity", () => {
    const c = fakeClock();
    const rl = new RateLimiter({ ratePerSecond: 100, capacity: 100, now: c.now, sleep: c.sleep });
    c.advance(10_000);
    expect(rl.waitTimeMs(100)).toBe(0);
    expect(rl.waitTimeMs(101)).toBeGreaterThan(0);
  });

  it("rejects requests larger than capacity", () => {
    const rl = new RateLimiter({ ratePerSecond: 10 });
    expect(() => rl.take(11)).toThrow(/exceeds capacity/);
  });

  it("tryTake spends at once and refuses, without waiting, when empty", () => {
    const c = fakeClock();
    const rl = new RateLimiter({ ratePerSecond: 1, capacity: 2, now: c.now, sleep: c.sleep });
    expect([rl.tryTake(1), rl.tryTake(1), rl.tryTake(1)]).toEqual([true, true, false]);
    c.advance(1000);
    expect(rl.tryTake(1)).toBe(true);
    expect(rl.tryTake(1)).toBe(false);
    expect(c.sleeps).toEqual([]);
  });
});

describe("gmailLimiter", () => {
  it("keeps a sustained batch of 100 under 250 units per second", async () => {
    const { gmailLimiter } = await import("./rate-limiter");
    let t = 0;
    const rl = gmailLimiter({ now: () => t, sleep: async (ms) => void (t += ms) });
    await Promise.all(Array.from({ length: 100 }, () => rl.take(GMAIL_UNITS_PER_MESSAGE_GET)));
    // 500 units, 50 burst, 450 at 225/s = 2s.
    expect(500 / (t / 1000)).toBeLessThanOrEqual(GMAIL_UNITS_PER_SECOND);
  });
});
