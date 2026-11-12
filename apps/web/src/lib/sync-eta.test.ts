import { describe, expect, it } from "vitest";
import { etaWords, syncEta } from "./sync-eta";

const t0 = Date.UTC(2026, 10, 2, 12, 0, 0);
const at = (seconds: number) => new Date(t0 + seconds * 1000);

describe("syncEta", () => {
  it("knows nothing until the run has a total", () => {
    const r = syncEta({ phase: "search", scanned: 400, totalEstimate: null, startedAt: at(0), updatedAt: at(10), finishedAt: null, nowMs: at(10).getTime() });
    expect(r).toEqual({ remaining: null, etaSeconds: null, percent: null });
  });

  it("uses the observed rate once the run is a few seconds old", () => {
    // 1,200 scanned in 60 s = 20/s; 6,000 left = 300 s.
    const r = syncEta({ phase: "exhaustive", scanned: 1200, totalEstimate: 7200, startedAt: at(0), updatedAt: at(60), finishedAt: null, nowMs: at(60).getTime() });
    expect(r).toEqual({ remaining: 6000, etaSeconds: 300, percent: 16 });
  });

  it("never promises faster than the Gmail quota allows", () => {
    // A burst of 5,000 in 10 s would be 500/s; the cap is 50/s.
    const r = syncEta({ phase: "exhaustive", scanned: 5000, totalEstimate: 10_000, startedAt: at(0), updatedAt: at(10), finishedAt: null, nowMs: at(10).getTime() });
    expect(r.etaSeconds).toBe(100);
  });

  it("forgets the estimate once the run has passed it, instead of sitting at 99%", () => {
    const r = syncEta({ phase: "exhaustive", scanned: 9000, totalEstimate: 8000, startedAt: at(0), updatedAt: at(100), finishedAt: null, nowMs: at(100).getTime() });
    expect(r).toEqual({ remaining: null, percent: null, etaSeconds: null });
  });

  it("is complete when finished", () => {
    const r = syncEta({ phase: "done", scanned: 10, totalEstimate: 10, startedAt: at(0), updatedAt: at(5), finishedAt: at(5) });
    expect(r).toEqual({ remaining: 0, etaSeconds: 0, percent: 100 });
  });
});

describe("etaWords", () => {
  it("rounds to words a person would say", () => {
    expect(etaWords(null)).toBeNull();
    expect(etaWords(20)).toBe("under a minute");
    expect(etaWords(150)).toBe("about 3 min");
    expect(etaWords(3600)).toBe("about 1 hr");
    expect(etaWords(4260)).toBe("about 1 hr 11 min");
  });
});
