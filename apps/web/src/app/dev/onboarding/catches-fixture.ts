/** Dev preview only: a month of catches across kinds, for the Today chart. Not real data. */
import type { Catch, Catches } from "@/lib/catches";
import { NOW } from "./fixtures";

const at = (daysAgo: number, plusMin = 0) => new Date(NOW - daysAgo * 86_400_000 + plusMin * 60_000).toISOString();
const c = (id: string, kind: Catch["kind"], project: string, what: string, daysAgo: number, fixMin: number | null, extra: Partial<Catch> = {}): Catch => ({
  id, kind, project, what, caughtAt: at(daysAgo), alertedAt: kind === "check" ? null : at(daysAgo, 1), heardAt: null, agent: null,
  fixedAt: fixMin === null ? null : at(daysAgo, fixMin), fixedBy: null, status: fixMin === null ? "open" : "fixed", note: null, ...extra,
});

const list: Catch[] = [
  c("o1", "job", "n8peace/news-factory", "nightly-publish went quiet", 0.3, null, { heardAt: at(0.3, 6), agent: "macbook-write" }),
  c("f1", "deploy", "n8peace/daystart", "Deploy failed: Type error in app/today/page.tsx", 1.2, 19, { heardAt: at(1.2, 4), agent: "macbook-read", fixedBy: { kind: "commit", sha: "a1b2c3d", message: "Fix the today page type" } }),
  c("f2", "site", "plain-ballot", "Site down", 3.5, 7),
  c("f3", "check", "n8peace/my-happenings", "Preview deployments are public", 5, 2 * 1440, { fixedBy: { kind: "pr", url: "https://github.com/n8peace/my-happenings/pull/12" } }),
  c("f4", "deploy", "n8peace/artifact-news", "Deploy failed: Module not found", 8, 42, { heardAt: at(8, 9), agent: "macbook-write", fixedBy: { kind: "commit", sha: "9e8f7a1", message: "Add the missing chart import" } }),
  c("f5", "job", "n8peace/daystart", "morning-audio run failed", 11, 95),
  c("f6", "server_errors", "n8peace/natepeace", "Server errors", 14, 12),
  c("f7", "deploy", "n8peace/spooky-particles", "Deploy failed: Build exceeded memory", 19, 6 * 60, { fixedBy: { kind: "commit", sha: "4c5d6e7", message: "Split the image route" } }),
  c("f8", "check", "n8peace/daystart", "Node 18 runtime is past end of life", 24, 4 * 1440),
  c("w1", "job", "n8peace/newsletter", "send run failed", 0.9, null, { status: "waiting", note: "It has not run since it failed, so there is nothing to judge yet.", nextRunAt: at(-0.4) }),
  c("r1", "deploy", "n8peace/old-site", "Deploy failed", 20, null, { status: "retired", note: "The project is retired: its repo is archived and nothing of it runs in production." }),
];
const n = (s: Catch["status"][]) => list.filter((x) => s.includes(x.status)).length;

export const CATCHES: Catches = {
  catches: list,
  summary: { caught: list.length, fixed: n(["fixed"]), open: n(["open"]), waiting: n(["waiting"]), closed: n(["retired", "ignored"]), medianFixMinutes: 95 },
  windowDays: 30,
  checkedAt: new Date(NOW).toISOString(),
};
export const CATCHES_NONE: Catches = { catches: [], summary: { caught: 0, fixed: 0, open: 0, waiting: 0, closed: 0, medianFixMinutes: null }, windowDays: 30, checkedAt: new Date(NOW).toISOString() };
