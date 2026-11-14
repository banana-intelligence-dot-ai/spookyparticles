/**
 * The words on the Projects home and the project page, as pure functions: the value line, each
 * project's status in one sentence, the row order, what needs the owner, and one history
 * timeline with successes summed per day. Routing words follow lib/break-guide, never more:
 * failed deploys and failed, quiet or never-checked-in jobs reach agents on their own; site down
 * and server errors alert the owner only; check suggestions wait for the owner.
 */
import {
  breakKind,
  breakPrompt,
  claimOn,
  routingStatus,
  sameProject,
  sinceWords,
  whatHappened,
  whatToDo,
  type BreakKind,
  type ClaimLike,
} from "@/lib/break-guide";
import type { Catch } from "@/lib/catches";
import type { RunRow } from "@/lib/run-history";
import { duration as fixDuration } from "./catch-log";
import { plural } from "./data-model";
import { dayHeading, dayKey, isFailedState, lastProductionAt, siteConfirmedDown, type Deployment, type Project } from "./project-model";
import type { JobRow } from "./today-model";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WINDOW_DAYS = 30;

const isBreak = (c: Catch) => c.kind !== "check";
const forProject = <T extends { project: string | null }>(list: T[], name: string) => list.filter((x) => x.project && sameProject(x.project, name));

/** Breaks not fixed yet, one per kind and project: repeats of the same failure count once. */
export function stillOpen(catches: Catch[]): Catch[] {
  const seen = new Map<string, Catch>();
  for (const c of catches) {
    if (!isBreak(c) || (c.status !== "open" && c.status !== "waiting")) continue;
    const key = `${c.kind}|${(c.project ?? "").toLowerCase()}|${c.jobId ?? ""}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

function medianMinutes(fixed: Catch[]): number | null {
  const d = fixed
    .map((c) => (Date.parse(c.fixedAt as string) - Date.parse(c.caughtAt)) / 60_000)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b);
  if (!d.length) return null;
  const mid = d.length >> 1;
  return d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2;
}

/** A fix counts as your agents' when an agent asked about the break, opened the PR, or confirmed it on production. */
const byAgent = (c: Catch) => Boolean(c.heardAt || c.confirmedAt || c.fixedBy?.kind === "pr");

export type ValueLine = { watching: string; headline: string; open: string | null; openCount: number; checks: string | null };

/**
 * The value, said once, from real numbers: projects watched, breaks fixed in 30 days with the
 * median time, and what is still open. "Your agents fixed" only when every fix had an agent in it.
 */
export function valueLine(input: { projects: Pick<Project, "health">[]; catches: Catch[] }): ValueLine {
  const watching = input.projects.filter((p) => p.health !== "archived").length;
  const fixed = input.catches.filter((c) => isBreak(c) && c.status === "fixed" && c.fixedAt);
  const agents = fixed.filter(byAgent).length;
  const openCount = stillOpen(input.catches).length;
  const checkCount = input.catches.filter((c) => c.kind === "check" && c.status === "open").length;
  const checks = checkCount ? `${plural(checkCount, "suggestion waits", "suggestions wait")} for you.` : null;
  const watchingWords = watching ? `Watching ${plural(watching, "project", "projects")}.` : "No projects found yet.";
  if (!fixed.length && !openCount) {
    return { watching: watchingWords, headline: "Nothing has broken yet. When something does, your agent hears first.", open: null, openCount: 0, checks };
  }
  let headline = `Nothing fixed yet in the last ${WINDOW_DAYS} days.`;
  if (fixed.length) {
    const m = medianMinutes(fixed);
    const median = m === null ? "" : `, median ${fixDuration(m * 60_000)}`;
    const breaks = plural(fixed.length, "break", "breaks");
    headline =
      agents === fixed.length
        ? `Your agents fixed ${breaks} in the last ${WINDOW_DAYS} days${median}.`
        : `${breaks} fixed in the last ${WINDOW_DAYS} days${median}.${agents ? ` Your agents fixed ${agents} of them.` : ""}`;
  }
  return { watching: watchingWords, headline, open: openCount ? `${openCount} still open.` : "Nothing open.", openCount, checks };
}

/** Who has a break, in a few words, for a list row. The full line is routingStatus. */
export function routingShort(kind: BreakKind, claim: ClaimLike | null): string {
  if (kind === "check") return "Waits for you.";
  if (kind === "site_down" || kind === "server_errors") return "You were alerted.";
  if (!claim) return "Sent to your agents.";
  if (!claim.apiKeyId) return "You claimed it.";
  if (claim.agent && /fixer/i.test(claim.agent)) return "Your fixer is on it.";
  return claim.agent ? `${claim.agent} is on it.` : "An agent is on it.";
}

export type Tone = "broken" | "look" | "fine" | "quiet" | "none";
export const TONE_RANK: Record<Tone, number> = { broken: 0, look: 1, fine: 2, quiet: 3, none: 4 };
export type ProjectStatus = { tone: Tone; word: string; detail: string | null; sentence: string; at: string | null };

type Ctx = { catches: Catch[]; jobs: JobRow[]; claims: ClaimLike[]; now: number };
type Reason = { at: string | null; words: string; kind: BreakKind; catchKind?: Catch["kind"]; jobId?: string | null };

const newestFirst = (a: { at: string | null }, b: { at: string | null }) => (b.at ?? "").localeCompare(a.at ?? "");
const failedDeploy = (p: Project): Deployment | null => p.deployments.find((d) => isFailedState(d.state) && !d.ignored) ?? null;
const envDeploy = (env: string | null | undefined) => (env && !/^production$/i.test(env) ? `${env} deploy` : "deploy");

/** A break in a few words: "deploy failed", "nightly went quiet", "site down". */
function breakWords(c: Catch): string {
  if (c.kind === "deploy") return `${envDeploy(/\(([^)]+)\)$/.exec(c.what)?.[1])} failed`;
  if (c.kind === "site") return "site down";
  if (c.kind === "server_errors") return "server errors";
  return c.what;
}

function brokenReasons(p: Project, mine: Catch[], jobs: JobRow[]): Reason[] {
  const out: Reason[] = mine
    .filter((c) => isBreak(c) && c.status === "open")
    .map((c) => ({ at: c.caughtAt, words: breakWords(c), kind: breakKind(c, jobs.find((j) => j.id === c.jobId)?.status), catchKind: c.kind, jobId: c.jobId ?? null }));
  const has = (k: Catch["kind"]) => out.some((r) => r.catchKind === k);
  if (p.health === "failed" && !has("deploy")) {
    const d = failedDeploy(p);
    out.push({ at: d?.at ?? null, words: `${envDeploy(d?.environment)} failed`, kind: "deploy_failed", catchKind: "deploy" });
  }
  if (siteConfirmedDown(p) && !has("site")) out.push({ at: p.uptime?.since ?? null, words: "site down", kind: "site_down", catchKind: "site" });
  for (const j of jobs) {
    if (j.status !== "down" || out.some((r) => r.jobId === j.id)) continue;
    const failed = j.lastPingKind === "fail" && j.missCount === 0;
    out.push({ at: failed ? j.lastPingAt : null, words: `${j.name} ${failed ? "run failed" : "went quiet"}`, kind: failed ? "job_failed" : "job_quiet", catchKind: "job", jobId: j.id });
  }
  return out.sort(newestFirst);
}

function lookReasons(p: Project, mine: Catch[], jobs: JobRow[], now: number): { at: string | null; words: string }[] {
  const out: { at: string | null; words: string }[] = [];
  for (const c of mine.filter((c) => isBreak(c) && c.status === "waiting")) out.push({ at: c.caughtAt, words: `${breakWords(c)}, waiting on its next run` });
  const checks = mine.filter((c) => c.kind === "check" && c.status === "open");
  if (checks.length) out.push({ at: checks.map((c) => c.caughtAt).sort().at(-1) ?? null, words: plural(checks.length, "check suggestion", "check suggestions") });
  for (const j of jobs) {
    if (j.status === "late") out.push({ at: j.lastPingAt, words: `${j.name} is late` });
    if (j.status === "never_checked_in") out.push({ at: null, words: `${j.name} has not checked in yet` });
  }
  if (p.stalePush) out.push({ at: p.stalePush.pushedAt, words: `pushed ${sinceWords(p.stalePush.pushedAt, now)}, but ${p.stalePush.host} has not deployed it` });
  if (p.health !== "failed") {
    const d = failedDeploy(p);
    if (d) out.push({ at: d.at, words: `last ${envDeploy(d.environment)} failed${d.at ? ` ${sinceWords(d.at, now)}` : ""}` });
  }
  for (const n of p.notices) {
    if (n.kind === "incident_alert" && n.verified && n.at && now - Date.parse(n.at) <= WINDOW_DAYS * DAY) out.push({ at: n.at, words: `${n.vendor} reported an incident ${sinceWords(n.at, now)}` });
  }
  return out;
}

const more = (n: number) => (n > 0 ? `, and ${n} more` : "");
const make = (tone: Tone, word: string, detail: string | null, at: string | null): ProjectStatus => ({ tone, word, detail, sentence: detail ? `${word}: ${detail}` : `${word}.`, at });

/**
 * One project's status in words, from the same data the list and the project page share:
 * "Broken: nightly job run failed 3 h ago. Your fixer is on it." / "Fine: deployed 4 min ago,
 * 3 jobs on time." / "No deploys found." Spend findings never make a project want a look here.
 */
export function projectStatus(p: Project, ctx: Ctx): ProjectStatus {
  const mine = forProject(ctx.catches, p.name);
  const jobs = forProject(ctx.jobs, p.name);
  const broken = brokenReasons(p, mine, jobs);
  if (broken.length) {
    const b = broken[0];
    const when = b.at ? ` ${sinceWords(b.at, ctx.now)}` : "";
    return make("broken", "Broken", `${b.words}${when}${more(broken.length - 1)}. ${routingShort(b.kind, claimOn(ctx.claims, p.name))}`, b.at);
  }
  const look = lookReasons(p, mine, jobs, ctx.now);
  if (look.length) return make("look", "Wants a look", `${look[0].words}${more(look.length - 1)}.`, look.map((l) => l.at).filter(Boolean).sort().at(-1) ?? null);

  if (p.health === "archived") return make("quiet", "Quiet", "archived on GitHub.", p.lastPushAt);
  if (p.health === "idle") {
    const days = p.lastPushAt ? Math.floor((ctx.now - Date.parse(p.lastPushAt)) / DAY) : null;
    return make("quiet", "Quiet", days !== null ? `no ${p.kind === "host" ? "deploy" : "push"} in ${plural(days, "day", "days")}.` : "nothing new in months.", p.lastPushAt);
  }
  const live = lastProductionAt(p) ?? p.deployments.filter((d) => d.state === "success" && d.at).map((d) => d.at as string).sort().at(-1) ?? null;
  const onTime = jobs.filter((j) => j.status === "up").length;
  const parts = [live ? `deployed ${sinceWords(live, ctx.now)}` : null, onTime ? `${plural(onTime, "job", "jobs")} on time` : null].filter(Boolean);
  if (parts.length) return make("fine", "Fine", `${parts.join(", ")}.`, live);
  return make("none", "No deploys found", null, p.lastPushAt);
}

/** Broken first, then wants a look, fine, quiet, no data; inside a group the newest news first, then by name. */
export function sortByStatus<R extends { name: string; status: ProjectStatus }>(rows: R[]): R[] {
  return [...rows].sort(
    (a, b) => TONE_RANK[a.status.tone] - TONE_RANK[b.status.tone] || (b.status.at ?? "").localeCompare(a.status.at ?? "") || a.name.localeCompare(b.name),
  );
}

/** Rows shown at once, and the quiet and no-data rows folded under "N more with nothing to report". */
export function splitQuiet<R extends { status: ProjectStatus }>(rows: R[]): { shown: R[]; folded: R[] } {
  const folded = rows.filter((r) => r.status.tone === "quiet" || r.status.tone === "none");
  // Nothing loud to show: no fold, or the page would open on a button.
  if (folded.length === rows.length) return { shown: rows, folded: [] };
  return { shown: rows.filter((r) => !folded.includes(r)), folded };
}

// ---------- Needs you: what is open on one project that no break record covers ----------

export type NeedItem = {
  id: string;
  title: string;
  happened: string;
  routing: { sent: boolean; text: string };
  todo: string;
  action: { label: string; href: string; external: boolean } | null;
  prompt: string;
  tone: "red" | "amber";
};

/**
 * Open items on a project that have no catch of their own (catches render with the catch log's
 * open help): a job down or never checked in before its alert was written, a late job, a site
 * confirmed down, a failed deploy the chart has not recorded, and a push the host never built.
 */
export function extraNeeds(p: Project, ctx: Ctx & { detailsHref: string }): NeedItem[] {
  const mine = forProject(ctx.catches, p.name).filter((c) => c.status === "open" || c.status === "waiting");
  const jobs = forProject(ctx.jobs, p.name);
  const claim = claimOn(ctx.claims, p.name);
  const out: NeedItem[] = [];
  const covered = (k: Catch["kind"]) => mine.some((c) => c.kind === k);
  const push = (id: string, kind: BreakKind, title: string, happened: string, action: NeedItem["action"], cause: string | null = null, at: string | null = null) =>
    out.push({ id, title, happened, routing: routingStatus(kind, claim, ctx.now), todo: whatToDo(kind), action, prompt: breakPrompt({ project: p.name, what: title, cause, link: action?.external ? action.href : null, at }), tone: kind === "job_never" ? "amber" : "red" });

  if (p.health === "failed" && !covered("deploy")) {
    const d = failedDeploy(p);
    const title = `${envDeploy(d?.environment)} failed`.replace(/^./, (c) => c.toUpperCase());
    const action = d?.inspectorUrl ? { label: "Open build log", href: d.inspectorUrl, external: true } : d?.url ? { label: "Open deploy", href: d.url, external: true } : { label: "See deploys", href: ctx.detailsHref, external: false };
    push(`deploy-${p.id}`, "deploy_failed", title, whatHappened({ kind: "deploy_failed", what: title, cause: d?.cause ?? null }, ctx.now), action, d?.cause ?? null, d?.at ?? null);
  }
  if (siteConfirmedDown(p) && !covered("site")) {
    push(`site-${p.id}`, "site_down", "Site down", whatHappened({ kind: "site_down", what: "Site down" }, ctx.now), p.productionUrl ? { label: "Open site", href: p.productionUrl, external: true } : null, null, p.uptime?.since ?? null);
  }
  for (const j of jobs) {
    if (mine.some((c) => c.jobId === j.id)) continue;
    const href = `/app/jobs#job-${j.id}`;
    const due = j.nextDueAt ?? (j.lastPingAt ? new Date(Date.parse(j.lastPingAt) + j.periodMinutes * 60_000).toISOString() : null);
    if (j.status === "down" || j.status === "never_checked_in") {
      const kind: BreakKind = j.status === "never_checked_in" ? "job_never" : j.lastPingKind === "fail" && j.missCount === 0 ? "job_failed" : "job_quiet";
      const title = kind === "job_never" ? `${j.name} has not checked in yet` : kind === "job_failed" ? `${j.name} run failed` : `${j.name} went quiet`;
      push(`job-${j.id}`, kind, title, whatHappened({ kind, what: title, note: j.lastNote, lastCheckIn: j.lastPingAt, dueAt: due }, ctx.now), { label: "Open the job", href, external: false }, j.lastNote);
    } else if (j.status === "late") {
      const title = `${j.name} is late`;
      out.push({
        id: `late-${j.id}`,
        title,
        happened: j.lastPingAt ? `Late: last check-in ${sinceWords(j.lastPingAt, ctx.now)}${due ? `, was due ${sinceWords(due, ctx.now)}` : ""}.` : "Late, and it has never checked in.",
        routing: { sent: false, text: "Late, not quiet yet. If it misses its grace time, it goes to your agents." },
        todo: whatToDo("job_quiet"),
        action: { label: "Open the job", href, external: false },
        prompt: breakPrompt({ project: p.name, what: title, cause: j.lastNote }),
        tone: "amber",
      });
    }
  }
  if (p.stalePush) {
    const s = p.stalePush;
    const title = `${s.host} has not deployed the latest push`;
    out.push({
      id: `stale-${p.id}`,
      title,
      happened: `Pushed ${sinceWords(s.pushedAt, ctx.now)}. ${s.lastDeployAt ? `The last deploy was ${sinceWords(s.lastDeployAt, ctx.now)}.` : `${s.host} shows no deploy for it.`}`,
      routing: { sent: false, text: "Not sent to your agents: this one waits for you." },
      todo: `Open ${s.host} and check why the push did not build.`,
      action: { label: "See deploys", href: ctx.detailsHref, external: false },
      prompt: breakPrompt({ project: p.name, what: title, at: s.pushedAt }),
      tone: "amber",
    });
  }
  return out;
}

// ---------- History: one timeline, newest first ----------

export type HistoryItem =
  | { type: "fixed"; id: string; at: string; what: string; took: string; by: string | null; prUrl: string | null; confirmed: boolean }
  | { type: "open"; id: string; at: string; what: string; waiting: boolean; check: boolean }
  | { type: "closed"; id: string; at: string; what: string; note: string };
export type HistoryDay = { key: string; heading: string; items: HistoryItem[]; summary: string | null };

/** Who fixed it, from what the fix left behind: the commit, the agent's PR, or the agent that picked it up. */
export function fixedByWords(c: Pick<Catch, "fixedBy" | "agent" | "heardAt">): string | null {
  if (c.fixedBy?.kind === "commit") return `commit ${c.fixedBy.sha.slice(0, 7)}${c.fixedBy.message ? ` (${c.fixedBy.message.split("\n")[0]})` : ""}`;
  if (c.fixedBy?.kind === "pr") return "your agent's pull request";
  if (c.heardAt) return c.agent ? `${c.agent}, after it asked about it` : "your agent, after it asked about it";
  return null;
}

/**
 * The project's last 30 days as days, newest first. Each break sits on the day it was fixed (or
 * caught, while open), and each day ends with its successes summed: "12 deploys, 48 job runs,
 * all fine". Deploys count what the host kept (its latest per environment); job runs come from
 * the 14 days of check-ins Schedules keeps. "All fine" only on a day with no failed run and no break.
 */
export function projectHistory(input: { catches: Catch[]; deployments: Pick<Deployment, "state" | "at">[]; runs: Pick<RunRow, "bins">[]; runsSince: string | null; now: number }): HistoryDay[] {
  const since = input.now - WINDOW_DAYS * DAY;
  const days = new Map<string, { at: string; items: HistoryItem[]; deploys: number; ok: number; fail: number }>();
  const dayOf = (iso: string) => {
    const k = dayKey(iso);
    const d = days.get(k) ?? { at: iso, items: [], deploys: 0, ok: 0, fail: 0 };
    if (iso > d.at) d.at = iso;
    days.set(k, d);
    return d;
  };
  const inWindow = (iso: string | null): iso is string => Boolean(iso && Date.parse(iso) >= since && Date.parse(iso) <= input.now + HOUR);

  for (const c of input.catches) {
    if (c.status === "fixed" && inWindow(c.fixedAt)) {
      dayOf(c.fixedAt).items.push({ type: "fixed", id: c.id, at: c.fixedAt, what: c.what, took: fixDuration(Date.parse(c.fixedAt) - Date.parse(c.caughtAt)), by: fixedByWords(c), prUrl: c.fixedBy?.kind === "pr" ? c.fixedBy.url : null, confirmed: Boolean(c.confirmedAt) });
    } else if ((c.status === "open" || c.status === "waiting") && inWindow(c.caughtAt)) {
      dayOf(c.caughtAt).items.push({ type: "open", id: c.id, at: c.caughtAt, what: c.what, waiting: c.status === "waiting", check: c.kind === "check" });
    } else if ((c.status === "retired" || c.status === "ignored") && inWindow(c.caughtAt)) {
      dayOf(c.caughtAt).items.push({ type: "closed", id: c.id, at: c.caughtAt, what: c.what, note: c.note ?? (c.status === "ignored" ? "You marked it as not mattering." : "Closed without a fix.") });
    }
  }
  for (const d of input.deployments) if (d.state === "success" && inWindow(d.at)) dayOf(d.at).deploys += 1;
  if (input.runsSince) {
    const start = Date.parse(input.runsSince);
    for (const r of input.runs) {
      for (const [hour, ok, fail] of r.bins) {
        const iso = new Date(start + hour * HOUR).toISOString();
        if (!inWindow(iso)) continue;
        const d = dayOf(iso);
        d.ok += ok;
        d.fail += fail;
      }
    }
  }
  const summaryOf = (deploys: number, runs: number, fail: number, items: HistoryItem[]) => {
    const parts = [deploys ? plural(deploys, "deploy", "deploys") : null, runs ? plural(runs, "job run", "job runs") : null].filter(Boolean);
    const tail = fail ? `${plural(fail, "run", "runs")} failed` : items.some((i) => i.type !== "closed") ? null : "all fine";
    return parts.length ? [...parts, tail].filter(Boolean).join(", ") : null;
  };
  const sorted = [...days.entries()].map(([key, d]) => ({ key, ...d, items: d.items.sort(newestFirst) })).sort(newestFirst);
  // Back-to-back days where nothing happened and everything ran fine fold into one line,
  // so a month of green reads as one sentence instead of thirty identical rows.
  const out: HistoryDay[] = [];
  for (let i = 0; i < sorted.length; ) {
    const quiet = (d: (typeof sorted)[number]) => !d.items.length && !d.fail;
    let j = i;
    if (quiet(sorted[i])) while (j + 1 < sorted.length && quiet(sorted[j + 1]) && dayKey(sorted[j + 1].at) === dayKey(new Date(Date.parse(sorted[j].at) - DAY).toISOString())) j += 1;
    if (j > i) {
      const run = sorted.slice(i, j + 1);
      const sum = (f: (d: (typeof run)[number]) => number) => run.reduce((n, d) => n + f(d), 0);
      out.push({ key: run[0].key, heading: `${dayHeading(run.at(-1)!.at, input.now)} to ${dayHeading(run[0].at, input.now)}`, items: [], summary: summaryOf(sum((d) => d.deploys), sum((d) => d.ok), 0, []) });
    } else {
      const d = sorted[i];
      out.push({ key: d.key, heading: dayHeading(d.at, input.now), items: d.items, summary: summaryOf(d.deploys, d.ok + d.fail, d.fail, d.items) });
    }
    i = j + 1;
  }
  return out;
}
