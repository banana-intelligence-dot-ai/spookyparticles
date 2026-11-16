import { describe, expect, it } from "vitest";
import { falseAlarms, jobsToForgive, outageGap, OUTAGE_GAP_MS } from "./self-outage";

const from = Date.parse("2026-11-16T02:42:00Z");
const to = Date.parse("2026-11-16T19:45:00Z");
const now = to + 20 * 60_000;
type Job = Parameters<typeof jobsToForgive>[0][number];
const job = (id: string, over: Record<string, unknown> = {}): Job => ({ id, userId: "u", name: id, status: "down" as const, lastPingAt: new Date(from - 3_600_000), lastPingKind: "ok", nextDueAt: new Date(to + 60_000), periodMinutes: 1440, maxRunMinutes: null, schedule: null, timeZone: null, source: "manual", ...over }) as Job;
const alert = (id: string, jobId: string, kind: string, at: number, payload: Record<string, unknown> = {}) => ({ id, userId: "u", kind, key: id, payload: { jobId, ...payload }, createdAt: new Date(at), sentAt: new Date(at) });

describe("outageGap", () => {
  it("is null for a normal 5-minute tick and for the first run ever", () => {
    expect(outageGap(now - 5 * 60_000, now)).toBeNull();
    expect(outageGap(now - OUTAGE_GAP_MS, now)).toBeNull();
    expect(outageGap(null, now)).toBeNull();
  });
  it("is the whole gap once three ticks are missed", () => {
    expect(outageGap(from, to)).toEqual({ from, to });
  });
});

describe("jobsToForgive", () => {
  it("forgives jobs that were fine at the start and not heard from since", () => {
    expect(jobsToForgive([job("a"), job("b", { status: "late" })], new Set(), from, now).map((j) => j.id)).toEqual(["a", "b"]);
  });
  it("keeps jobs already broken before the outage, failed runs, and jobs heard from since", () => {
    const jobs = [job("broken"), job("failed", { lastPingKind: "fail" }), job("back", { status: "up", lastPingAt: new Date(to + 60_000) })];
    expect(jobsToForgive(jobs, new Set(["broken"]), from, now)).toEqual([]);
  });
  it("leaves an up job alone until it is actually due", () => {
    expect(jobsToForgive([job("weekly", { status: "up", nextDueAt: new Date(now + 86_400_000) })], new Set(), from, now)).toEqual([]);
    expect(jobsToForgive([job("due", { status: "up", nextDueAt: new Date(now - 60_000) })], new Set(), from, now).map((j) => j.id)).toEqual(["due"]);
  });
});

describe("falseAlarms", () => {
  it("marks quiet alerts and the back alert the first ping made, but not later real ones", () => {
    const firstPing = to + 5 * 60_000;
    const alerts = [
      alert("q1", "a", "job_quiet", to + 60_000),
      alert("b1", "a", "job_recovered", firstPing),
      alert("q2", "a", "job_quiet", to + 3_600_000),
      alert("q3", "never", "job_quiet", to + 60_000),
      alert("f1", "c", "job_failed", to + 60_000),
    ];
    const ids = falseAlarms(alerts, new Set(), new Map([["a", firstPing]]), from).map((a) => a.id);
    expect(ids).toEqual(["q1", "b1", "q3"]);
  });
  it("never marks a job that was already broken when Spooky went down", () => {
    expect(falseAlarms([alert("q", "a", "job_quiet", to + 60_000)], new Set(["a"]), new Map(), from)).toEqual([]);
  });
});
