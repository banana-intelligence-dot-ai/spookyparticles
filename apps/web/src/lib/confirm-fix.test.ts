import { describe, expect, it } from "vitest";
import { fixVerdict, formatFixCheckText } from "./confirm-fix";
import type { Incident } from "./incidents";

const now = Date.parse("2026-11-12T20:00:00Z");
const fresh = new Date(now - 60_000).toISOString();
const deploy: Incident = { kind: "deploy_failed", key: "n1@t", project: "acme/web", environment: "production", host: "Vercel", state: "error", at: "2026-11-12T19:40:00Z", url: null, cause: "Type error: x is not a function", logTail: [], inspectorUrl: null, commit: null, source: "Vercel build log" };
const job: Incident = { kind: "job", name: "nightly", project: "acme/web", status: "down", issue: "failed", lastCheckIn: null, lastNote: null, nextDue: "2026-11-13T02:00:00Z", url: "/app/jobs" };

describe("fixVerdict", () => {
  it("says fixed only from a fresh read with nothing broken or building", () => {
    expect(fixVerdict({ project: "acme/web", known: true, incidents: [], building: [], readAt: fresh, now }).verdict).toBe("fixed");
  });
  it("never says fixed for a project it does not know", () => {
    expect(fixVerdict({ project: "acme/typo", known: false, incidents: [], building: [], readAt: fresh, now }).verdict).toBe("unknown_project");
  });
  it("waits for a fresh read before saying fixed", () => {
    const v = fixVerdict({ project: "acme/web", known: true, incidents: [], building: [], readAt: new Date(now - 10 * 60_000).toISOString(), now });
    expect(v.verdict).toBe("checking");
    expect(v.retryAfterSeconds).toBe(60);
  });
  it("waits while a deploy is building", () => {
    expect(fixVerdict({ project: "acme/web", known: true, incidents: [], building: [{ name: "web (production, Vercel)", at: fresh }], readAt: fresh, now }).verdict).toBe("checking");
  });
  it("keeps a failing deploy broken, with its cause", () => {
    const v = fixVerdict({ project: "acme/web", known: true, incidents: [deploy, job], building: [], readAt: fresh, now });
    expect(v.verdict).toBe("still_broken");
    expect(v.message).toContain("Type error");
    expect(formatFixCheckText({ ...v, checkedAt: fresh })).toContain("deploy failed (production)");
  });
  it("waits on a job's next run when deploys are healthy", () => {
    const v = fixVerdict({ project: "acme/web", known: true, incidents: [job], building: [], readAt: fresh, now });
    expect(v.verdict).toBe("waiting_on_run");
    expect(v.message).toContain("nightly");
  });
});
