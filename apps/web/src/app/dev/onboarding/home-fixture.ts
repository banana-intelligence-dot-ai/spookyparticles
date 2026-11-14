/** Dev preview only: breaks, jobs and runs for the Projects home and one project page. Not real data. */
import type { Catch } from "@/lib/catches";
import type { Claim } from "@/lib/claims";
import { runWindow, RUN_DAYS, type RunBin, type RunHistory } from "@/lib/run-history";
import type { CatchesWithClaims } from "@/app/app/home-view";
import type { JobRow } from "@/app/app/today-model";
import { NOW } from "./fixtures";

const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const c = (id: string, project: string, what: string, caughtH: number, fixH: number | null, extra: Partial<Catch> = {}): Catch => ({
  id, kind: "deploy", project, what, caughtAt: at(caughtH), alertedAt: at(caughtH - 0.02), heardAt: null, agent: null,
  fixedAt: fixH === null ? null : at(caughtH - fixH), fixedBy: null, status: fixH === null ? "open" : "fixed", note: null, ...extra,
});

const list: Catch[] = [
  c("o1", "octocat/ledger-api", "Deploy failed: Type error in src/routes/ledger.ts", 3, null, { cause: "Type error in src/routes/ledger.ts" }),
  c("o2", "hubot/docs-site", "Deploy failed", 26, null),
  c("k1", "octocat/billing-web", "Preview deployments are public", 50, null, { kind: "check", alertedAt: null }),
  c("f1", "octocat/ledger-api", "Deploy failed: Module not found: ./money", 30, 1.2, { heardAt: at(29.9), agent: "fixer on my-laptop", fixedBy: { kind: "commit", sha: "a1b2c3d4", message: "Add the missing money module" }, confirmedAt: at(28.7) }),
  c("f2", "octocat/ledger-api", "nightly-reconcile run failed", 80, 0.6, { kind: "job", jobId: "j1", heardAt: at(79.9), agent: "Claude Code on the laptop", fixedBy: { kind: "pr", url: "https://github.com/octocat/ledger-api/pull/41" } }),
  c("f3", "octocat/edge-proxy", "Deploy failed: Build exceeded memory", 120, 3.5, { heardAt: at(119), agent: "fixer on my-laptop", fixedBy: { kind: "commit", sha: "4c5d6e7f", message: "Split the image route" } }),
  c("f4", "hubot/status-site", "Site down", 200, 0.3, { kind: "site" }),
  c("f5", "octocat/queue-worker", "drain went quiet", 300, 2, { kind: "job", jobId: "j3", heardAt: at(299), agent: "Cursor" }),
  c("f6", "octocat/search-api", "Deploy failed", 400, 0.8, { heardAt: at(399.8), agent: "fixer on my-laptop", fixedBy: { kind: "commit", sha: "9e8f7a1b", message: "Pin the node version" } }),
];

const claims: Claim[] = [{ project: "octocat/ledger-api", apiKeyId: "k1", agent: "fixer on my-laptop", at: at(0.1), until: at(-0.4) }];

const n = (s: Catch["status"][]) => list.filter((x) => s.includes(x.status)).length;
export const HOME_CATCHES: CatchesWithClaims = {
  catches: list,
  summary: { caught: list.length, fixed: n(["fixed"]), open: n(["open"]), waiting: 0, closed: 0, medianFixMinutes: 72 },
  windowDays: 30,
  checkedAt: new Date(NOW).toISOString(),
  claims,
};
export const HOME_NONE: CatchesWithClaims = { catches: [], summary: { caught: 0, fixed: 0, open: 0, waiting: 0, closed: 0, medianFixMinutes: null }, windowDays: 30, checkedAt: new Date(NOW).toISOString(), claims: [] };

export const HOME_JOBS: JobRow[] = [
  { id: "j1", name: "nightly-reconcile", project: "octocat/ledger-api", status: "up", lastPingAt: at(5), lastPingKind: "ok", lastNote: null, periodMinutes: 1440, missCount: 0 },
  { id: "j2", name: "hourly-sync", project: "octocat/ledger-api", status: "up", lastPingAt: at(0.4), lastPingKind: "ok", lastNote: null, periodMinutes: 60, missCount: 0 },
  { id: "j3", name: "drain", project: "octocat/queue-worker", status: "late", lastPingAt: at(7), lastPingKind: "ok", lastNote: null, periodMinutes: 360, missCount: 0 },
  { id: "j4", name: "warm-cache", project: "octocat/edge-proxy", status: "up", lastPingAt: at(0.2), lastPingKind: "ok", lastNote: null, periodMinutes: 30, missCount: 0 },
];

const { since } = runWindow(new Date(NOW));
const hourly = (failAt: number[] = []): RunBin[] => Array.from({ length: RUN_DAYS * 24 - 1 }, (_, i) => (failAt.includes(i) ? [i, 0, 1] : [i, 1, 0]) as RunBin);
export const HOME_RUNS: RunHistory = {
  windowDays: RUN_DAYS,
  since: new Date(since).toISOString(),
  checkedAt: new Date(NOW).toISOString(),
  jobs: [
    { id: "j1", name: "nightly-reconcile", project: "octocat/ledger-api", status: "up", periodMinutes: 1440, bins: hourly().filter((b) => b[0] % 24 === 3).map((b, i) => (i === 10 ? [b[0], 0, 1] : b)), misses: [], runs: 13, fails: 1 },
    { id: "j2", name: "hourly-sync", project: "octocat/ledger-api", status: "up", periodMinutes: 60, bins: hourly(), misses: [], runs: 335, fails: 0 },
  ],
  summary: { runs: 348, caught: 1, back: 1, medianBackMinutes: 36 },
};
