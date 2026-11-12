import { describe, expect, it } from "vitest";
import { watchHealth } from "./health";

describe("watcher health", () => {
  const now = Date.parse("2026-11-10T23:00:00Z");
  it("is healthy when the last run was recent and finished", () => {
    expect(watchHealth({ lastRunAt: new Date(now - 4 * 60_000), lastOk: true }, now)).toMatchObject({ ok: true, reason: null, ageSeconds: 240 });
  });
  it("is stale past 15 minutes, whatever the last result", () => {
    expect(watchHealth({ lastRunAt: new Date(now - 16 * 60_000), lastOk: true }, now)).toMatchObject({ ok: false, reason: "stale" });
  });
  it("reports a failed last run", () => {
    expect(watchHealth({ lastRunAt: new Date(now - 60_000), lastOk: false }, now)).toMatchObject({ ok: false, reason: "last_run_failed" });
  });
  it("reports never ran", () => {
    expect(watchHealth(null, now)).toMatchObject({ ok: false, reason: "never_ran" });
  });
});
