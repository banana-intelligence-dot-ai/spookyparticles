import { describe, expect, it } from "vitest";
import { buildRunHistory, dueFromKey, runWindow, type RunInput } from "./run-history";

const NOW = new Date("2026-11-12T12:30:00Z");
const t = (s: string) => new Date(`2026-11-${s}Z`);
const job = (id: string, name: string, status = "up") => ({ id, name, project: null, status, periodMinutes: 1440 });
const alert = (kind: string, key: string, at: string, jobId: string) => ({ kind, key, payload: { jobId }, createdAt: t(at), sentAt: t(at) });
const base = (over: Partial<RunInput>): RunInput => ({ jobs: [], buckets: [], alerts: [], ...over });

describe("buildRunHistory", () => {
  it("bins ok and failed runs by hour inside the 14-day window", () => {
    const { since } = runWindow(NOW);
    expect(new Date(since).toISOString()).toBe("2026-10-29T13:00:00.000Z");
    const r = buildRunHistory(base({ jobs: [job("j1", "nightly")], buckets: [
      { jobId: "j1", hour: t("12T08:00:00"), kind: "ok", n: 2 },
      { jobId: "j1", hour: t("12T08:00:00"), kind: "fail", n: 1 },
      { jobId: "j1", hour: t("12T08:00:00"), kind: "start", n: 3 },
      { jobId: "j1", hour: t("01T00:00:00"), kind: "ok", n: 1 },
      { jobId: "j1", hour: new Date("2026-10-20T00:00:00Z"), kind: "ok", n: 5 },
    ] }), NOW);
    const row = r.jobs[0];
    expect(row.runs).toBe(3);
    expect(row.fails).toBe(1);
    expect(row.bins).toEqual([[59, 1, 0], [331, 2, 1]]);
  });

  it("opens a miss at the due time, counts repeats, and closes it when the job is back", () => {
    const r = buildRunHistory(base({ jobs: [job("j1", "nightly")], alerts: [
      alert("job_quiet", "job_quiet:j1:1:2026-11-10T08:00", "10T08:10:00", "j1"),
      alert("job_quiet", "job_quiet:j1:2:2026-11-11T08:00", "11T08:10:00", "j1"),
      alert("job_recovered", "job_recovered:j1:2026-11-11T09:00", "11T09:00:00", "j1"),
    ] }), NOW);
    expect(r.jobs[0].misses).toEqual([{ kind: "quiet", from: "2026-11-10T08:00:00.000Z", alertedAt: "2026-11-10T08:10:00.000Z", backAt: "2026-11-11T09:00:00.000Z", missed: 2 }]);
    expect(r.summary).toEqual({ runs: 0, caught: 1, back: 1, medianBackMinutes: 1500 });
  });

  it("lists a job that is still down first and hides retired jobs with nothing to show", () => {
    const r = buildRunHistory(base({
      jobs: [job("a", "alpha"), job("b", "beta"), job("c", "gone", "retired")],
      alerts: [alert("job_failed", "job_failed:b:2026-11-12T07:00", "12T07:00:00", "b")],
    }), NOW);
    expect(r.jobs.map((j) => j.name)).toEqual(["beta", "alpha"]);
    expect(r.jobs[0].misses[0]).toMatchObject({ kind: "failed", backAt: null, missed: 0 });
    expect(r.summary.medianBackMinutes).toBeNull();
  });

  it("drops misses that closed before the window and ignores alerts for other jobs", () => {
    const r = buildRunHistory(base({ jobs: [job("a", "alpha")], alerts: [
      { ...alert("job_quiet", "job_quiet:a:1:2026-10-20T08:00", "10T00:00:00", "a"), createdAt: new Date("2026-10-20T08:10:00Z") },
      { ...alert("job_recovered", "job_recovered:a:x", "10T00:00:00", "a"), createdAt: new Date("2026-10-21T08:00:00Z") },
      alert("job_quiet", "job_quiet:a:1:2026-11-10T08:00", "10T08:10:00", "a"),
      alert("job_quiet", "job_quiet:z:1:2026-11-10T08:00", "10T08:10:00", "z"),
    ] }), NOW);
    expect(r.jobs[0].misses).toHaveLength(1);
    expect(r.summary.caught).toBe(1);
  });
});

describe("dueFromKey", () => {
  it("reads the due minute out of a quiet key", () => {
    expect(dueFromKey("job_quiet:abc:3:2026-11-09T08:00")).toBe("2026-11-09T08:00:00.000Z");
    expect(dueFromKey("job_failed:abc")).toBeNull();
  });
});
