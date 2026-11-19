/**
 * Dev preview only: the inputs for Now and Agents, run through the real builders so the preview
 * shows the product's own words. Obviously fake names. Imports server libraries, so only the
 * server page may import this file.
 */
import { buildAgents, type AgentsReport } from "@/lib/agents";
import type { Catch, Catches } from "@/lib/catches";
import type { Claim } from "@/lib/claims";
import { medianFixMinutes } from "@/lib/fix-stats";
import type { Cleared } from "@/lib/ignores";
import type { Mute } from "@/lib/mutes";
import { buildOpenItems, type OpenInput, type OpenReport } from "@/lib/open-items";
import { NOW } from "./fixtures";

const H = 3_600_000;
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();
const date = (hoursAgo: number) => new Date(NOW - hoursAgo * H);
const c = (id: string, kind: Catch["kind"], project: string, what: string, caughtH: number, fixH: number | null, extra: Partial<Catch> = {}): Catch => ({
  id, clearKey: id, kind, project, what, caughtAt: at(caughtH), alertedAt: kind === "check" ? null : at(caughtH - 0.02), heardAt: null, agent: null,
  fixedAt: fixH === null ? null : at(caughtH - fixH), fixedBy: null, status: fixH === null ? "open" : "fixed", note: null, ...extra,
});
const heard = (hoursAgo: number, key: "k1" | "k2") => ({ heardAt: at(hoursAgo), agent: key === "k1" ? "Claude Code on the laptop" : "Codex on the mini", agentKeyId: key });

const FIXED: Catch[] = [
  c("f1", "deploy", "octocat/ledger-api", "Deploy failed: Module not found: ./money", 30, 0.2, { ...heard(29.95, "k1"), fixedBy: { kind: "commit", sha: "a1b2c3d4", message: "Add the missing money module" }, confirmedAt: at(29.7) }),
  c("f2", "job", "octocat/ledger-api", "nightly-reconcile run failed", 80, 0.6, { jobId: "j1", ...heard(79.9, "k1"), fixedBy: { kind: "pr", url: "https://github.com/octocat/ledger-api/pull/41" } }),
  c("f3", "deploy", "octocat/edge-proxy", "Deploy failed: Build exceeded memory", 120, 3.5, { ...heard(119.5, "k1"), fixedBy: { kind: "commit", sha: "4c5d6e7f", message: "Split the image route" } }),
  c("f4", "site", "hubot/status-site", "Site down", 200, 0.1),
  c("f5", "job", "octocat/queue-worker", "drain went quiet", 300, 2, { jobId: "j3", ...heard(299.6, "k2") }),
  c("f6", "deploy", "octocat/search-api", "Deploy failed: Type error in src/index.ts", 400, 0.8, { ...heard(399.9, "k1"), fixedBy: { kind: "commit", sha: "9e8f7a1b", message: "Pin the node version" } }),
  c("f7", "check", "octocat/billing-web", "Node 18 runtime is past end of life", 520, 52, { fixedBy: { kind: "pr", url: "https://github.com/octocat/billing-web/pull/7" } }),
];
const OPEN: Catch[] = [
  c("o1", "deploy", "octocat/ledger-api", "Deploy failed: Type error in src/routes/ledger.ts", 3, null, { cause: "Type error: Property 'cents' does not exist on type 'Entry'.", ...heard(2.95, "k1") }),
  c("o2", "deploy", "octocat/old-landing", "Deploy failed", 290, null),
  c("o3", "deploy", "octocat/old-landing", "Deploy failed", 310, null),
  c("o4", "deploy", "octocat/old-landing", "Deploy failed", 330, null),
  c("o5", "check", "octocat/billing-web", "Preview deployments are public", 50, null),
  c("o6", "check", "octocat/billing-web", "No error page for server errors", 50, null),
  c("w1", "job", "hubot/newsletter", "send run failed", 20, null, { jobId: "j5", status: "waiting", note: "It has not run since it failed, so there is nothing to judge yet.", nextRunAt: at(-9) }),
];
const CLAIMS: Claim[] = [{ project: "octocat/ledger-api", apiKeyId: "k1", agent: "Claude Code on the laptop", at: at(0.1), until: at(-0.4) }];

const job = (id: string, name: string, project: string, status: OpenInput["jobs"][number]["status"]) => ({ id, name, project, status, lastPingAt: at(26), lastNote: null, nextDueAt: at(-9) });
const project = (id: string, name: string, pushedH: number, over: Partial<OpenInput["projects"][number]> = {}): OpenInput["projects"][number] => ({ id, name, health: "ok", lastPushAt: at(pushedH), kind: "repo", stalePush: null, ...over });

const BUSY: OpenInput = {
  catches: [...OPEN, ...FIXED],
  claims: CLAIMS,
  jobs: [job("j1", "nightly-reconcile", "octocat/ledger-api", "up"), job("j5", "send", "hubot/newsletter", "down")],
  connections: [{ id: "g4", provider: "github", display: "example-labs", status: "errored", statusReason: "Installation suspended on GitHub" }],
  projects: [
    project("p1", "octocat/ledger-api", 3),
    project("p2", "octocat/old-landing", 140 * 24),
    project("p3", "octocat/billing-web", 60),
    project("p4", "hubot/docs-site", 5, { health: "attention", stalePush: { pushedAt: at(5), lastDeployAt: at(170), host: "Vercel", sha: "abc123456789", message: "Ship docs", branch: "main" } }),
    project("p5", "hubot/newsletter", 90),
    project("p6", "octocat/edge-proxy", 30),
    project("p7", "octocat/search-api", 200),
  ],
  mutes: [],
  cleared: new Set(),
  agents: 3,
  windowDays: 30,
  now: NOW,
};
const CALM: OpenInput = { ...BUSY, catches: FIXED, claims: [], connections: [], projects: BUSY.projects.map((p) => ({ ...p, health: "ok" as const, stalePush: null })), jobs: [BUSY.jobs[0]] };
const NONE: OpenInput = { ...BUSY, catches: [], claims: [], jobs: [], connections: [], projects: [], agents: 0 };

const KEYS = [
  { id: "k1", name: "Claude Code on the laptop", prefix: "sp_7f3a", scopes: ["read"], createdAt: date(6 * 24), lastUsedAt: date(0.05), revokedAt: null, expiresAt: null },
  { id: "k2", name: "Codex on the mini", prefix: "sp_b21c", scopes: ["read", "write"], createdAt: date(20 * 24), lastUsedAt: date(7), revokedAt: null, expiresAt: date(-70 * 24) },
  { id: "k3", name: "Cursor", prefix: "sp_44aa", scopes: ["read"], createdAt: date(2 * 24), lastUsedAt: null, revokedAt: null, expiresAt: null },
  { id: "k4", name: "Old CI job", prefix: "sp_09de", scopes: ["read"], createdAt: date(60 * 24), lastUsedAt: date(41 * 24), revokedAt: date(40 * 24), expiresAt: null },
];
const read = (project: string, apiKeyId: string, hoursAgo: number) => ({ project, apiKeyId, at: date(hoursAgo) });
const READS = [read("octocat/ledger-api", "k1", 0.05), read("octocat/edge-proxy", "k1", 30), read("octocat/search-api", "k1", 200), read("octocat/queue-worker", "k2", 7), read("hubot/newsletter", "k2", 22)];

export type NowFixture = { open: OpenReport; agents: AgentsReport; history: Catches & { claims?: Claim[] }; mutes: Mute[]; cleared: Cleared[]; projects: string[] };

const MUTES: Mute[] = [
  { key: "octocat/retired-blog|*", project: "octocat/retired-blog", kind: null, reason: "The project ended.", at: at(9 * 24), by: "you" },
  { key: "hubot/docs-site|check", project: "hubot/docs-site", kind: "check", reason: null, at: at(3 * 24), by: "Claude Code on the laptop" },
];
const CLEARED: Cleared[] = [
  { key: "c1", project: "octocat/search-api", what: "Deploy failed", at: at(26), by: "you" },
  { key: "c2", project: "octocat/billing-web", what: "No sitemap", at: at(5 * 24), by: "Codex on the mini" },
];

/** many: a busy day. done: nothing open. empty: a new account. Any other state reads as busy. */
export function nowFixture(state: string | null): NowFixture {
  const input = state === "done" ? CALM : state === "empty" ? NONE : BUSY;
  const none = input === NONE;
  const claims = input === BUSY ? CLAIMS : [];
  const n = (status: Catch["status"]) => input.catches.filter((x) => x.status === status).length;
  const median = medianFixMinutes(input.catches.filter((x) => x.status === "fixed"));
  return {
    open: buildOpenItems(input),
    history: {
      catches: input.catches,
      summary: { caught: input.catches.length, fixed: n("fixed"), open: n("open"), waiting: n("waiting"), closed: 0, medianFixMinutes: median === null ? null : Math.round(median) },
      windowDays: 30,
      checkedAt: new Date(NOW).toISOString(),
      claims,
    },
    agents: buildAgents({ keys: none ? [] : KEYS, reads: none ? [] : READS, claims, catches: input.catches, unheard: input === BUSY ? [{ project: "octocat/old-landing", open: 3 }] : [], now: NOW }),
    mutes: none ? [] : MUTES,
    cleared: none ? [] : CLEARED,
    projects: input.projects.map((p) => p.name),
  };
}
