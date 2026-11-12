import { describe, expect, it } from "vitest";
import { decideRuns, expectedRuns, nextRun, pickSchedules } from "./vercel-schedules";

const ms = (value: string) => Date.parse(value);
const runs = (cron: string, start: string, end: string) => expectedRuns(cron, ms(start), ms(end))?.map((n) => new Date(n).toISOString());

describe("Vercel schedule definitions", () => {
  it("picks legacy crons and named schedules without copying other project data", () => {
    expect(pickSchedules({ crons: { definitions: [{ path: "/api/daily", schedule: "0 0 * * *", host: "secret.example" }] }, schedules: { billing: { path: "/api/bill", schedule: "*/5 * * * *", requestMethod: "POST" } } })).toEqual([
      { name: "/api/daily", path: "/api/daily", schedule: "0 0 * * *", method: "GET" },
      { name: "billing", path: "/api/bill", schedule: "*/5 * * * *", method: "POST" },
    ]);
    expect(pickSchedules({})).toEqual([]);
    expect(pickSchedules({ crons: { definitions: [null, { path: 1, schedule: "* * * * *" }] }, schedules: { bad: null } })).toEqual([]);
  });
});

describe("UTC cron", () => {
  it("handles every minute, steps, hourly and daily", () => {
    expect(runs("* * * * *", "2026-01-01T00:00:00Z", "2026-01-01T00:03:00Z")).toEqual(["2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "2026-01-01T00:03:00.000Z"]);
    expect(runs("*/5 * * * *", "2026-01-01T00:01:00Z", "2026-01-01T00:11:00Z")).toEqual(["2026-01-01T00:05:00.000Z", "2026-01-01T00:10:00.000Z"]);
    expect(runs("0 * * * *", "2026-01-01T00:01:00Z", "2026-01-01T02:00:00Z")).toHaveLength(2);
    expect(nextRun("0 0 * * *", ms("2026-01-01T23:00:00Z"))).toBe(ms("2026-01-02T00:00:00Z"));
  });
  it("handles lists, ranges, weekdays, month boundaries and Sunday 7", () => {
    expect(runs("0 9 * * 1-5", "2026-01-30T09:00:00Z", "2026-02-02T09:00:00Z")).toEqual(["2026-02-02T09:00:00.000Z"]);
    expect(runs("0 0 1 * *", "2026-01-31T23:59:00Z", "2026-02-01T00:00:00Z")).toEqual(["2026-02-01T00:00:00.000Z"]);
    expect(nextRun("0 0 29 2 *", ms("2026-03-01T00:00:00Z"))).toBe(ms("2028-02-29T00:00:00Z"));
    expect(runs("0,30 9-10 * * 7", "2026-02-01T08:59:00Z", "2026-02-01T10:59:00Z")).toHaveLength(4);
    expect(runs("0 0 1 * 1", "2026-02-01T00:00:00Z", "2026-02-03T00:00:00Z")).toEqual(["2026-02-02T00:00:00.000Z"]);
  });
  it("rejects unsupported syntax and bad ranges", () => {
    for (const cron of ["@daily", "0 0 * *", "0 0 ? * *", "60 * * * *", "*/0 * * * *", "0 0 31-1 * *"]) expect(expectedRuns(cron, 0, 60_000)).toBeNull();
  });
});

describe("request-count buckets", () => {
  const due = 10 * 60_000 + 5_000;
  const decide = (buckets: { atMs: number; path: string; status: number }[], now = due + 60_000) => decideRuns([due], buckets, "/job", 60_000, now);
  const bucket = (atMs: number, status = 200) => ({ atMs, path: "/job", status });
  it("matches on time, 40 seconds late in the same bucket, the next bucket, and the grace edge", () => {
    expect(decide([bucket(10 * 60_000)])[0].kind).toBe("ok");
    expect(decide([bucket(11 * 60_000)])[0].kind).toBe("ok");
    expect(decide([bucket(9 * 60_000)])[0].kind).toBe("ok");
    expect(decide([bucket(11 * 60_000)], due + 60_000)[0].kind).toBe("ok");
  });
  it("fails every error response, including route errors", () => {
    for (const status of [500, 404, 401]) expect(decide([bucket(10 * 60_000, status)])[0]).toMatchObject({ kind: "fail", status });
  });
  it("marks no bucket missed only after grace and consumes separate buckets for close runs", () => {
    expect(decide([], due + 59_999)).toEqual([]);
    expect(decide([], due + 60_000)[0].kind).toBe("missed");
    expect(decideRuns([due, due + 60_000], [bucket(10 * 60_000), bucket(11 * 60_000)], "/job", 60_000, due + 120_000).map((x) => x.kind)).toEqual(["ok", "ok"]);
    expect(decideRuns([due, due + 60_000], [bucket(10 * 60_000)], "/job", 60_000, due + 120_000).map((x) => x.kind)).toEqual(["ok", "missed"]);
  });
});
