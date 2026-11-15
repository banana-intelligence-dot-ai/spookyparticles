import { describe, expect, it } from "vitest";
import { IGNORED, UNIGNORED, clearedFrom, clearedJobsFrom, clearInput } from "./ignores";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 12, 12, minute));
const event = (name: string, key: string, minute: number) => ({
  name, properties: { key, project: "me/app", what: key, by: "you" }, createdAt: at(minute),
});
const alert = (kind: string, key: string, minute: number) => ({ kind, key, payload: { jobId: "j1" }, createdAt: at(minute) });

describe("clearedFrom", () => {
  it("keeps active clears newest first with their saved words", () => {
    expect(clearedFrom([event(IGNORED, "old", 1), event(IGNORED, "new", 3)])).toMatchObject([
      { key: "new", project: "me/app", what: "new", by: "you" },
      { key: "old", project: "me/app", what: "old", by: "you" },
    ]);
  });

  it("removes a clear after restore, then includes a later clear", () => {
    expect(clearedFrom([event(IGNORED, "k", 1), event(UNIGNORED, "k", 2)])).toEqual([]);
    expect(clearedFrom([event(IGNORED, "k", 1), event(UNIGNORED, "k", 2), event(IGNORED, "k", 3)])).toHaveLength(1);
  });
});

describe("clearInput", () => {
  it("accepts one key and trims the saved fields", () => {
    expect(clearInput({ key: " k ", project: " me/app ", what: " Failed " })).toEqual({ keys: ["k"], project: "me/app", what: "Failed" });
  });

  it("accepts a list of keys", () => {
    expect(clearInput({ keys: [" a ", "b"] })).toEqual({ keys: ["a", "b"], project: "", what: null });
  });

  it("deduplicates repeated keys", () => {
    expect(clearInput({ keys: ["a", " a ", "b"] }).keys).toEqual(["a", "b"]);
  });

  it("rejects missing, empty, non-string, and oversized lists", () => {
    for (const body of [null, {}, { key: " " }, { keys: ["a", 3] }, { keys: Array.from({ length: 51 }, (_, i) => `k${i}`) }]) {
      expect(() => clearInput(body)).toThrow();
    }
  });
});

describe("clearedJobsFrom", () => {
  it("clears a job when its newest alert was cleared", () => {
    expect(clearedJobsFrom([alert("job_failed", "fail", 1)], new Set(["fail"]))).toEqual(new Set(["j1"]));
  });

  it("does not clear a job after a recovery or newer uncleared break", () => {
    const ignored = new Set(["fail"]);
    expect(clearedJobsFrom([alert("job_failed", "fail", 1), alert("job_recovered", "back", 2)], ignored)).toEqual(new Set());
    expect(clearedJobsFrom([alert("job_failed", "fail", 1), alert("job_failed", "again", 3)], ignored)).toEqual(new Set());
  });
});
