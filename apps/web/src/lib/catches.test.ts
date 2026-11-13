import { describe, expect, it } from "vitest";
import { buildCatches, CAUGHT, FIX_CONFIRMED, FIXED, openJobEpisodes, type CatchInput } from "./catches";
import { breakKey } from "./ignores";
import { INBOX_READ } from "./agent-listening";

const NOW = new Date("2026-11-12T12:00:00Z");
const t = (s: string) => new Date(`2026-11-${s}Z`);
const base = (over: Partial<CatchInput>): CatchInput => ({ alerts: [], events: [], checks: [], attempts: [], keyNames: new Map(), ...over });
const alert = (kind: string, key: string, at: string, payload: Record<string, unknown> = {}) => ({ kind, key, payload, createdAt: t(at), sentAt: t(at) });

describe("buildCatches", () => {
  it("folds repeated quiet alerts into one job catch, closed by the recovery", () => {
    const r = buildCatches(base({ alerts: [
      alert("job_quiet", "job_quiet:j1:1:a", "10T08:00:00", { jobId: "j1", job: "nightly", project: "n8peace/app" }),
      alert("job_quiet", "job_quiet:j1:2:b", "10T09:00:00", { jobId: "j1", job: "nightly", project: "n8peace/app" }),
      alert("job_recovered", "job_recovered:j1:c", "10T09:30:00", { jobId: "j1", job: "nightly" }),
    ] }), NOW);
    expect(r.catches).toHaveLength(1);
    expect(r.catches[0]).toMatchObject({ kind: "job", what: "nightly went quiet", caughtAt: "2026-11-10T08:00:00.000Z", fixedAt: "2026-11-10T09:30:00.000Z" });
    expect(r.summary).toEqual({ caught: 1, fixed: 1, open: 0, waiting: 0, closed: 0, medianFixMinutes: 90 });
  });

  it("keeps a job that is still down open, listed first", () => {
    const r = buildCatches(base({ alerts: [
      alert("site_down", "site:p1:2026-11-09T10:00:00.000Z:down", "09T10:00:00", { project: "blog" }),
      alert("site_recovered", "site:p1:2026-11-09T10:00:00.000Z:recovered", "09T10:20:00", { project: "blog" }),
      alert("job_failed", "job_failed:j2:x", "11T07:00:00", { jobId: "j2", job: "publish" }),
    ] }), NOW);
    expect(r.catches.map((c) => [c.kind, c.fixedAt])).toEqual([["job", null], ["site", "2026-11-09T10:20:00.000Z"]]);
    expect(r.catches[0].what).toBe("publish run failed");
  });

  it("marks a fix checked on production when a later confirm said fixed", () => {
    const r = buildCatches(base({
      alerts: [
        alert("site_down", "site:p1:2026-11-09T10:00:00.000Z:down", "09T10:00:00", { project: "n8peace/blog" }),
        alert("site_recovered", "site:p1:2026-11-09T10:00:00.000Z:recovered", "09T10:20:00", { project: "n8peace/blog" }),
      ],
      events: [
        { name: FIX_CONFIRMED, properties: { project: "blog", verdict: "still_broken" }, createdAt: t("09T10:10:00") },
        { name: FIX_CONFIRMED, properties: { project: "blog", verdict: "fixed" }, createdAt: t("09T10:22:00") },
        { name: FIX_CONFIRMED, properties: { project: "other", verdict: "fixed" }, createdAt: t("09T10:21:00") },
      ],
    }), NOW);
    expect(r.catches[0].confirmedAt).toBe("2026-11-09T10:22:00.000Z");
  });

  it("pairs server errors on project and incident", () => {
    const r = buildCatches(base({ alerts: [
      alert("server_errors", "server_errors:p1:i9:alert", "08T01:00:00", { project: "api" }),
      alert("server_errors_recovered", "server_errors:p1:i9:recovered", "08T01:05:00", { project: "api" }),
    ] }), NOW);
    expect(r.catches[0]).toMatchObject({ kind: "server_errors", what: "Server errors", fixedAt: "2026-11-08T01:05:00.000Z" });
  });

  it("reads deploys from caught and fixed events, with the alert time and the fixing commit", () => {
    const r = buildCatches(base({
      alerts: [alert("deploy_failed", "deploy_failed:d1", "09T14:03:00", { project: "n8peace/site", at: "2026-11-09T14:02:00.000Z" })],
      events: [
        { name: CAUGHT, properties: { key: "deploy:n1:a", project: "n8peace/site", at: "2026-11-09T14:02:00.000Z", cause: "Type error" }, createdAt: t("09T14:05:00") },
        { name: FIXED, properties: { key: "deploy:n1:a", at: "2026-11-09T14:21:00.000Z", sha: "a1b2c3d", message: "Fix the build" }, createdAt: t("09T14:25:00") },
        { name: CAUGHT, properties: { key: "deploy:n2:b", project: "n8peace/other", at: "2026-11-11T09:00:00.000Z" }, createdAt: t("11T09:01:00") },
      ],
    }), NOW);
    const fixed = r.catches.find((c) => c.id === "deploy:n1:a");
    expect(fixed).toMatchObject({ what: "Deploy failed: Type error", alertedAt: "2026-11-09T14:03:00.000Z", fixedAt: "2026-11-09T14:21:00.000Z", fixedBy: { kind: "commit", sha: "a1b2c3d", message: "Fix the build" } });
    expect(r.catches.find((c) => c.id === "deploy:n2:b")).toMatchObject({ what: "Deploy failed", fixedAt: null, alertedAt: null });
  });

  it("shows fixed checks with the agent's PR and leaves dismissed ones out", () => {
    const check = { check: "deps_not_updated", evidence: {}, project: "n8peace/site" };
    const r = buildCatches(base({
      checks: [
        { ...check, id: "c1", state: "ok", firstOpenAt: t("05T00:00:00"), fixedAt: t("06T00:00:00"), dismissedAt: null },
        { ...check, id: "c2", state: "open", firstOpenAt: t("05T00:00:00"), fixedAt: null, dismissedAt: t("05T01:00:00") },
        { ...check, id: "c3", state: "ok", firstOpenAt: null, fixedAt: null, dismissedAt: null },
      ],
      attempts: [{ checkId: "c1", outcome: "pr_opened", prUrl: "https://github.com/n8peace/site/pull/4", takenAt: t("05T02:00:00") }],
    }), NOW);
    expect(r.catches).toHaveLength(1);
    expect(r.catches[0]).toMatchObject({ kind: "check", fixedBy: { kind: "pr", url: "https://github.com/n8peace/site/pull/4" } });
    expect(r.catches[0].what).toBeTruthy();
  });

  it("names the first agent read after the break, matching repo names without case", () => {
    const r = buildCatches(base({
      alerts: [
        alert("job_failed", "job_failed:j1:a", "10T08:00:00", { jobId: "j1", job: "nightly", project: "N8peace/App" }),
        alert("job_recovered", "job_recovered:j1:b", "10T09:00:00", { jobId: "j1" }),
      ],
      events: [
        { name: INBOX_READ, properties: { project: "app", apiKeyId: "k0" }, createdAt: t("10T07:00:00") },
        { name: INBOX_READ, properties: { project: "n8peace/app", apiKeyId: "k1" }, createdAt: t("10T08:04:00") },
        { name: INBOX_READ, properties: { project: "n8peace/app", apiKeyId: "k2" }, createdAt: t("10T08:30:00") },
      ],
      keyNames: new Map([["k1", "macbook"]]),
    }), NOW);
    expect(r.catches[0]).toMatchObject({ heardAt: "2026-11-10T08:04:00.000Z", agent: "macbook" });
  });

  it("drops catches fixed before the 30-day window", () => {
    const r = buildCatches(base({ alerts: [
      alert("job_failed", "job_failed:j1:a", "01T08:00:00", { jobId: "j1", job: "old" }),
      alert("job_recovered", "job_recovered:j1:b", "01T09:00:00", { jobId: "j1" }),
    ] }), new Date("2026-12-15T00:00:00Z"));
    expect(r.catches).toHaveLength(0);
    expect(r.summary.medianFixMinutes).toBeNull();
  });

  describe("catches that are not fixed say why, and the counts add up", () => {
    const quiet = alert("job_quiet", "job_quiet:j1:1:a", "10T20:35:00", { jobId: "j1", job: "watch" });
    const failed = alert("job_failed", "job_failed:j2:b", "12T12:15:00", { jobId: "j2", job: "send" });

    it("lists only the job episodes no recovery alert closed", () => {
      const open = openJobEpisodes([quiet, failed, alert("job_recovered", "job_recovered:j2:c", "12T12:20:00", { jobId: "j2" })]);
      expect([...open.keys()]).toEqual(["j1"]);
    });

    it("closes a job by its first good run when no recovery alert went out", () => {
      const jobs = new Map([["j1", { status: "up", nextDueAt: null, okAt: t("10T21:00:00") }]]);
      const r = buildCatches(base({ alerts: [quiet], jobs }), NOW);
      expect(r.catches[0]).toMatchObject({ status: "fixed", fixedAt: "2026-11-10T21:00:00.000Z" });
    });

    it("says a failed job with no run since is waiting, with its next run", () => {
      const jobs = new Map([["j2", { status: "up", nextDueAt: t("13T12:15:00"), okAt: null }]]);
      const r = buildCatches(base({ alerts: [failed], jobs }), NOW);
      expect(r.catches[0]).toMatchObject({ status: "waiting", fixedAt: null, nextRunAt: "2026-11-13T12:15:00.000Z" });
      expect(r.summary).toMatchObject({ caught: 1, fixed: 0, open: 0, waiting: 1, closed: 0 });
    });

    it("keeps a job that is still down open, and closes one that was removed", () => {
      const jobs = new Map([["j2", { status: "down", nextDueAt: null, okAt: null }]]);
      const r = buildCatches(base({ alerts: [quiet, failed], jobs }), NOW);
      expect(r.catches.map((c) => [c.what, c.status])).toEqual([["send run failed", "open"], ["watch went quiet", "retired"]]);
    });

    it("leaves jobs open when their state is unknown", () => {
      expect(buildCatches(base({ alerts: [quiet] }), NOW).catches[0].status).toBe("open");
    });

    it("closes a retired project's deploy and an ignored one, without counting them fixed", () => {
      const caught = (key: string, nodeId: string, at: string) => ({ name: CAUGHT, properties: { key, nodeId, project: "n8peace/x", at }, createdAt: new Date(at) });
      const r = buildCatches(base({
        events: [caught("deploy:n1:a", "n1", "2026-11-01T00:00:00.000Z"), caught("deploy:n2:b", "n2", "2026-11-02T00:00:00.000Z"), caught("deploy:n3:c", "n3", "2026-11-03T00:00:00.000Z")],
        retiredNodes: new Set(["n1"]),
        ignored: new Set([breakKey("n2", "2026-11-02T00:00:00.000Z")]),
      }), NOW);
      expect(Object.fromEntries(r.catches.map((c) => [c.id, c.status]))).toEqual({ "deploy:n1:a": "retired", "deploy:n2:b": "ignored", "deploy:n3:c": "open" });
      expect(r.summary).toMatchObject({ caught: 3, fixed: 0, open: 1, waiting: 0, closed: 2, medianFixMinutes: null });
      expect(r.catches[0].status).toBe("open");
    });
  });
});
