import { describe, expect, it } from "vitest";
import type { Catch } from "@/lib/catches";
import { defaultCatch, ledger } from "./catch-log";

describe("ledger", () => {
  it("says nothing when every catch was fixed", () => {
    expect(ledger({ caught: 4, fixed: 4, open: 0, waiting: 0, closed: 0, medianFixMinutes: 10 })).toBeNull();
  });
  it("accounts for every catch that was not fixed", () => {
    expect(ledger({ caught: 21, fixed: 17, open: 2, waiting: 1, closed: 1, medianFixMinutes: 150 })).toBe("Of 21: 17 fixed, 2 still open, 1 waiting on its next run, 1 closed without a fix.");
  });
});

const c = (id: string, over: Partial<Catch>): Catch => ({ id, kind: "deploy", project: "a/b", what: "Deploy failed", caughtAt: "2026-11-10T00:00:00Z", alertedAt: null, heardAt: null, agent: null, fixedAt: null, fixedBy: null, status: "open", note: null, ...over });

describe("defaultCatch", () => {
  it("opens on the oldest open break", () => {
    const list = [c("new", { caughtAt: "2026-11-12T00:00:00Z" }), c("old", { caughtAt: "2026-11-09T00:00:00Z" }), c("fix", { status: "fixed", fixedAt: "2026-11-12T05:00:00Z" })];
    expect(defaultCatch(list)?.id).toBe("old");
  });
  it("else the newest fix", () => {
    const list = [c("a", { status: "fixed", fixedAt: "2026-11-10T05:00:00Z" }), c("b", { status: "fixed", fixedAt: "2026-11-12T05:00:00Z" }), c("w", { status: "waiting" })];
    expect(defaultCatch(list)?.id).toBe("b");
  });
  it("is null for an empty month", () => {
    expect(defaultCatch([])).toBeNull();
  });
});
