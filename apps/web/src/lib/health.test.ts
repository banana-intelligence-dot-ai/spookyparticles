import { describe, expect, it } from "vitest";
import { digestHealth, watchHealth } from "./health";

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

describe("digest health", () => {
  const day = Date.parse("2026-11-12T15:00:00Z");
  it("waits until after the digest hour", () => {
    expect(digestHealth([], day - 60_000)).toBe("not_due");
  });
  it("reports missing, failed, and sent rows", () => {
    expect(digestHealth([], day)).toBe("not_yet");
    expect(digestHealth([{ sentAt: null }], day)).toBe("failed");
    expect(digestHealth([{ sentAt: null }, { sentAt: new Date(day) }], day)).toBe("sent");
  });
  it("calls a send that expected numbers and carried none empty", () => {
    expect(digestHealth([{ sentAt: new Date(day), payload: { sent: {}, numbers: { fresh: 0, expected: true, refused: 9 } } }], day)).toBe("empty");
    expect(digestHealth([{ sentAt: new Date(day), payload: { sent: {}, numbers: { fresh: 0, expected: false } } }], day)).toBe("sent");
    expect(digestHealth([{ sentAt: new Date(day), payload: { sent: {} } }], day)).toBe("sent");
  });
});
