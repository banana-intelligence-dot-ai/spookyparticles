import { describe, expect, it } from "vitest";
import { marketingAnswered, marketingChange, marketingOptedIn } from "./marketing";

const t = (iso: string) => new Date(iso);
const never = { optInAt: null, optOutAt: null };
const now = t("2026-11-17T12:00:00Z");

describe("marketingOptedIn", () => {
  it("is off by default", () => {
    expect(marketingOptedIn(never)).toBe(false);
    expect(marketingAnswered(never)).toBe(false);
  });
  it("is on after a yes with no later no", () => {
    expect(marketingOptedIn({ optInAt: t("2026-11-01T00:00:00Z"), optOutAt: null })).toBe(true);
    expect(marketingOptedIn({ optInAt: t("2026-11-02T00:00:00Z"), optOutAt: t("2026-11-01T00:00:00Z") })).toBe(true);
  });
  it("is off after a later no, and a tie counts as no", () => {
    expect(marketingOptedIn({ optInAt: t("2026-11-01T00:00:00Z"), optOutAt: t("2026-11-02T00:00:00Z") })).toBe(false);
    expect(marketingOptedIn({ optInAt: t("2026-11-01T00:00:00Z"), optOutAt: t("2026-11-01T00:00:00Z") })).toBe(false);
    expect(marketingOptedIn({ optInAt: null, optOutAt: t("2026-11-01T00:00:00Z") })).toBe(false);
  });
  it("counts any answer as answered", () => {
    expect(marketingAnswered({ optInAt: null, optOutAt: t("2026-11-01T00:00:00Z") })).toBe(true);
    expect(marketingAnswered({ optInAt: t("2026-11-01T00:00:00Z"), optOutAt: null })).toBe(true);
  });
});

describe("marketingChange", () => {
  it("records a first no thanks so the ask never returns", () => {
    expect(marketingChange(never, false, now)).toEqual({ marketingOptOutAt: now });
  });
  it("records a yes and keeps the first yes on a repeat", () => {
    expect(marketingChange(never, true, now)).toEqual({ marketingOptInAt: now });
    expect(marketingChange({ optInAt: t("2026-11-01T00:00:00Z"), optOutAt: null }, true, now)).toBeNull();
  });
  it("turns a yes off, and a later yes back on", () => {
    const on = { optInAt: t("2026-11-01T00:00:00Z"), optOutAt: null };
    expect(marketingChange(on, false, now)).toEqual({ marketingOptOutAt: now });
    const off = { optInAt: t("2026-11-01T00:00:00Z"), optOutAt: t("2026-11-02T00:00:00Z") };
    expect(marketingChange(off, true, now)).toEqual({ marketingOptInAt: now });
    expect(marketingChange(off, false, now)).toBeNull();
  });
  it("lands every change in the state it asked for", () => {
    const states = [
      never,
      { optInAt: t("2026-11-01T00:00:00Z"), optOutAt: null },
      { optInAt: t("2026-11-01T00:00:00Z"), optOutAt: t("2026-11-02T00:00:00Z") },
      { optInAt: null, optOutAt: t("2026-11-01T00:00:00Z") },
    ];
    for (const s of states) {
      for (const want of [true, false]) {
        const c = marketingChange(s, want, now);
        const next = { optInAt: c?.marketingOptInAt ?? s.optInAt, optOutAt: c?.marketingOptOutAt ?? s.optOutAt };
        expect(marketingOptedIn(next)).toBe(want);
        expect(marketingAnswered(next)).toBe(true);
      }
    }
  });
});
