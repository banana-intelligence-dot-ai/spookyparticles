import { describe, expect, it } from "vitest";
import type { Catch } from "@/lib/catches";
import { extraNeeds, fixedByWords, projectHistory, projectStatus, routingShort, sortByStatus, splitQuiet, stillOpen, valueLine } from "./home-model";
import type { Project } from "./project-model";
import type { JobRow } from "./today-model";

const NOW = Date.parse("2026-11-13T18:00:00.000Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const sp = (s: string | null) => (s ?? "").replace(/ /g, " ");

const c = (id: string, over: Partial<Catch> = {}): Catch => ({
  id,
  kind: "deploy",
  project: "me/web",
  what: "Deploy failed",
  caughtAt: ago(10),
  alertedAt: null,
  heardAt: null,
  agent: null,
  fixedAt: null,
  fixedBy: null,
  status: "open",
  note: null,
  ...over,
});
const fixed = (id: string, hoursToFix: number, over: Partial<Catch> = {}) => c(id, { status: "fixed", caughtAt: ago(48), fixedAt: ago(48 - hoursToFix), ...over });

const p = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "me/web",
  url: null,
  private: true,
  defaultBranch: "main",
  status: "active",
  lastPushAt: ago(2),
  health: "ok",
  deployments: [{ environment: "production", state: "success", url: "https://web.example", at: ago(1), provider: "vercel" }],
  monthlyCents: null,
  currency: null,
  subscriptions: [],
  notices: [],
  openFindings: [],
  ...over,
});
const job = (over: Partial<JobRow> = {}): JobRow => ({ id: "j1", name: "nightly", project: "me/web", status: "up", lastPingAt: ago(3), lastPingKind: "ok", lastNote: null, periodMinutes: 1440, missCount: 0, ...over });
const ctx = (over: Partial<{ catches: Catch[]; jobs: JobRow[]; claims: { project: string; agent: string | null; apiKeyId: string | null; at: string }[] }> = {}) => ({ catches: [], jobs: [], claims: [], now: NOW, ...over });

describe("valueLine", () => {
  it("says nothing has broken when there is no history", () => {
    const v = valueLine({ projects: [p(), p({ health: "archived" })], catches: [] });
    expect(sp(v.watching)).toBe("Watching 1 project.");
    expect(v.headline).toBe("Nothing has broken yet. When something does, your agent hears first.");
    expect(v.open).toBeNull();
  });

  it("credits agents only when every fix had an agent in it, with the median", () => {
    const all = valueLine({ projects: [p()], catches: [fixed("a", 1, { heardAt: ago(47) }), fixed("b", 2, { fixedBy: { kind: "pr", url: "u" } }), fixed("d", 3, { confirmedAt: ago(1) })] });
    expect(sp(all.headline)).toBe("Your agents fixed 3 breaks in the last 30 days, median 2 h.");
    expect(all.open).toBe("Nothing open.");
    const some = valueLine({ projects: [p()], catches: [fixed("a", 1, { heardAt: ago(47) }), fixed("b", 2)] });
    expect(sp(some.headline)).toBe("2 breaks fixed in the last 30 days, median 1.5 h. Your agents fixed 1 of them.");
  });

  it("counts a break once however often it repeats, leaves suggestions apart", () => {
    const v = valueLine({ projects: [p()], catches: [c("a"), c("b"), c("j", { kind: "job", jobId: "j1", what: "nightly went quiet" }), c("k", { kind: "check", what: "Old runtime" }), c("r", { status: "retired" })] });
    expect(v.open).toBe("2 still open.");
    expect(v.openCount).toBe(2);
    expect(v.headline).toBe("Nothing fixed yet in the last 30 days.");
    expect(sp(v.checks)).toBe("1 suggestion waits for you.");
  });

  it("stillOpen keeps waiting breaks and drops fixed and closed ones", () => {
    expect(stillOpen([c("a", { status: "waiting" }), fixed("b", 1), c("r", { status: "ignored" })]).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("routingShort", () => {
  it("states the routing truth", () => {
    expect(routingShort("check", null)).toBe("Waits for you.");
    expect(routingShort("site_down", null)).toBe("You were alerted.");
    expect(routingShort("deploy_failed", null)).toBe("Sent to your agents.");
    expect(routingShort("job_failed", { project: "x", agent: "fixer on my-laptop", apiKeyId: "k", at: ago(1) })).toBe("Your fixer is on it.");
    expect(routingShort("job_failed", { project: "x", agent: "Cursor", apiKeyId: "k", at: ago(1) })).toBe("Cursor is on it.");
    expect(routingShort("job_failed", { project: "x", agent: null, apiKeyId: null, at: ago(1) })).toBe("You claimed it.");
  });
});

describe("projectStatus", () => {
  it("broken: the newest break, how long ago, and who has it", () => {
    const s = projectStatus(p(), ctx({ catches: [c("j", { kind: "job", jobId: "j1", what: "nightly run failed", caughtAt: ago(3) })], jobs: [job({ status: "down", lastPingKind: "fail" })], claims: [{ project: "web", agent: "fixer", apiKeyId: "k", at: ago(1) }] }));
    expect(s.tone).toBe("broken");
    expect(s.sentence).toBe("Broken: nightly run failed 3 h ago. Your fixer is on it.");
  });

  it("broken from the project's own deploy state when no catch was written, and counts the rest", () => {
    const proj = p({ health: "failed", deployments: [{ environment: "Preview", state: "failure", url: null, at: ago(5), provider: "vercel" }], uptime: { state: "down", since: ago(1), lastCheckedAt: ago(0), lastStatus: "503", consecutiveDown: 3, alertAt: ago(0.5) } });
    const s = projectStatus(proj, ctx());
    expect(s.sentence).toBe("Broken: site down 1 h ago, and 1 more. You were alerted.");
  });

  it("wants a look: suggestions, late jobs, a push the host never built", () => {
    expect(projectStatus(p(), ctx({ catches: [c("k", { kind: "check", what: "Old runtime" })] })).sentence.replace(/ /g, " ")).toBe("Wants a look: 1 check suggestion.");
    expect(projectStatus(p(), ctx({ jobs: [job({ status: "late" })] })).sentence).toBe("Wants a look: nightly is late.");
    const stale = projectStatus(p({ health: "attention", stalePush: { pushedAt: ago(30), lastDeployAt: ago(100), host: "Vercel" } }), ctx());
    expect(stale.sentence).toBe("Wants a look: pushed 30 h ago, but Vercel has not deployed it.");
  });

  it("fine: when it last deployed and the jobs on time; spend findings do not count", () => {
    const s = projectStatus(p({ health: "attention", openFindings: [{ id: "f", kind: "zombie", title: "Paid twice", amountCents: 100 }] }), ctx({ jobs: [job(), job({ id: "j2" })] }));
    expect(s.tone).toBe("fine");
    expect(sp(s.sentence)).toBe("Fine: deployed 1 h ago, 2 jobs on time.");
  });

  it("quiet and no data", () => {
    expect(sp(projectStatus(p({ health: "idle", lastPushAt: ago(24 * 120), deployments: [] }), ctx()).sentence)).toBe("Quiet: no push in 120 days.");
    expect(projectStatus(p({ health: "archived" }), ctx()).sentence).toBe("Quiet: archived on GitHub.");
    expect(projectStatus(p({ health: "unknown", deployments: [] }), ctx()).sentence).toBe("No deploys found.");
  });

  it("matches catches and jobs named by repo alone", () => {
    expect(projectStatus(p(), ctx({ catches: [c("a", { project: "web" })] })).tone).toBe("broken");
  });
});

describe("sortByStatus and splitQuiet", () => {
  const row = (name: string, tone: "broken" | "look" | "fine" | "quiet" | "none", at: string | null = null) => ({ name, status: { tone, word: "", detail: null, sentence: "", at } });
  it("broken, look, fine, quiet, none; newest first inside a group", () => {
    const sorted = sortByStatus([row("a", "none"), row("b", "fine"), row("c", "broken", ago(5)), row("d", "broken", ago(1)), row("e", "quiet"), row("f", "look")]);
    expect(sorted.map((r) => r.name)).toEqual(["d", "c", "f", "b", "e", "a"]);
  });
  it("folds quiet and no-data rows, unless that is everything", () => {
    const { shown, folded } = splitQuiet([row("a", "fine"), row("b", "quiet"), row("c", "none")]);
    expect(shown.map((r) => r.name)).toEqual(["a"]);
    expect(folded.map((r) => r.name)).toEqual(["b", "c"]);
    expect(splitQuiet([row("b", "quiet")]).folded).toEqual([]);
  });
});

describe("projectHistory", () => {
  it("puts fixes on the day fixed, open breaks on the day caught, and sums successes per day", () => {
    const runsSince = new Date(NOW - 14 * 86_400_000).toISOString();
    const hourOf = (iso: string) => Math.floor((Date.parse(iso) - Date.parse(runsSince)) / 3_600_000);
    const days = projectHistory({
      catches: [fixed("f", 1.2, { fixedBy: { kind: "commit", sha: "a1b2c3d4e5", message: "Fix the build" }, confirmedAt: ago(40) }), c("o", { caughtAt: ago(0.5) })],
      deployments: [{ state: "success", at: ago(0.2) }, { state: "failure", at: ago(0.3) }],
      runs: [{ bins: [[hourOf(ago(0.1)), 3, 0], [hourOf(ago(72)), 4, 1]] }],
      runsSince,
      now: NOW,
    });
    const today = days[0];
    expect(today.items.map((i) => i.type)).toEqual(["open"]);
    expect(sp(today.summary)).toBe("1 deploy, 3 job runs");
    const fixDay = days.find((d) => d.items.some((i) => i.type === "fixed"))!;
    const item = fixDay.items[0];
    expect(item.type === "fixed" && item.took).toBe("1.2 h");
    expect(item.type === "fixed" && item.by).toBe("commit a1b2c3d (Fix the build)");
    const runDay = days.find((d) => d.summary?.includes("failed"))!;
    expect(sp(runDay.summary)).toBe("5 job runs, 1 run failed");
  });

  it("says all fine on a quiet good day, and leaves out what is older than 30 days", () => {
    const days = projectHistory({ catches: [fixed("old", 1, { caughtAt: ago(24 * 40), fixedAt: ago(24 * 39) })], deployments: [{ state: "success", at: ago(30) }], runs: [], runsSince: null, now: NOW });
    expect(days).toHaveLength(1);
    expect(sp(days[0].summary)).toBe("1 deploy, all fine");
  });

  it("folds back-to-back all-fine days into one line, and keeps a day with a failure on its own", () => {
    const runsSince = new Date(NOW - 14 * 86_400_000).toISOString();
    const hourOf = (iso: string) => Math.floor((Date.parse(iso) - Date.parse(runsSince)) / 3_600_000);
    const bins: [number, number, number][] = [1, 2, 3, 4].map((d) => [hourOf(ago(24 * d)), 5, 0]);
    bins.push([hourOf(ago(24 * 5)), 4, 1], [hourOf(ago(24 * 6)), 5, 0]);
    const days = projectHistory({ catches: [], deployments: [{ state: "success", at: ago(24 * 2) }], runs: [{ bins }], runsSince, now: NOW });
    expect(days).toHaveLength(3);
    expect(days[0].heading).toContain(" to ");
    expect(sp(days[0].summary)).toBe("1 deploy, 20 job runs, all fine");
    expect(sp(days[1].summary)).toBe("5 job runs, 1 run failed");
    expect(days[2].heading).not.toContain(" to ");
  });

  it("names who fixed it", () => {
    expect(fixedByWords({ fixedBy: { kind: "pr", url: "u" }, agent: null, heardAt: null })).toBe("your agent's pull request");
    expect(fixedByWords({ fixedBy: null, agent: "Cursor", heardAt: ago(1) })).toBe("Cursor, after it asked about it");
    expect(fixedByWords({ fixedBy: null, agent: null, heardAt: null })).toBeNull();
  });
});

describe("extraNeeds", () => {
  const opts = { detailsHref: "/app/projects/me/web/details" };
  it("adds what no catch covers, with routing truth", () => {
    const items = extraNeeds(p({ stalePush: { pushedAt: ago(30), lastDeployAt: null, host: "Vercel" } }), { ...ctx({ jobs: [job({ status: "down", lastPingKind: null, missCount: 2 }), job({ id: "j2", name: "weekly", status: "late" })] }), ...opts });
    expect(items.map((i) => i.title)).toEqual(["nightly went quiet", "weekly is late", "Vercel has not deployed the latest push"]);
    expect(items[0].routing.sent).toBe(true);
    expect(items[1].routing.sent).toBe(false);
    expect(items[2].action?.href).toBe(opts.detailsHref);
  });
  it("skips a job its catch already covers", () => {
    const items = extraNeeds(p(), { ...ctx({ catches: [c("j", { kind: "job", jobId: "j1", what: "nightly went quiet" })], jobs: [job({ status: "down" })] }), ...opts });
    expect(items).toEqual([]);
  });
  it("a site down alerts the owner only", () => {
    const items = extraNeeds(p({ productionUrl: "https://web.example", uptime: { state: "down", since: ago(1), lastCheckedAt: ago(0), lastStatus: "503", consecutiveDown: 3, alertAt: ago(0.5) } }), { ...ctx(), ...opts });
    expect(items[0].routing).toEqual({ sent: false, text: "You were alerted. Your agents are not told about this kind yet." });
    expect(items[0].action?.href).toBe("https://web.example");
  });
});
