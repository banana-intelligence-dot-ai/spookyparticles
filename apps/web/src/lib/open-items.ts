/**
 * Now: what is open, who has it, and the one next step. One list for the web app's first page,
 * GET /api/v1/open and the open_items tool, so a person and their agent read the same thing.
 *
 * "On you" is what no agent is told about (site down, server errors, check suggestions, a
 * connection that stopped working, a push the host never built), plus everything else when no
 * agent is connected. "With your agents" is what the agent inbox carries: failed deploys and jobs.
 * Routing words come from break-guide, never more than the code does.
 *
 * Every item that can be cleared carries its clear keys (POST /api/v1/notices/clear) and the
 * question to ask next: stop this kind of notice on the project, or the whole project when it
 * looks ended. Reads only; nothing here writes.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { breakKind, breakPrompt, claimOn, projectHref, routingStatus, sameProject, sinceWords, whatHappened, whatToDo, type BreakKind, type ClaimLike } from "./break-guide";
import { catchesFor, type Catch, type CatchKind } from "./catches";
import { listJobs, type JobView } from "./checkins";
import { claimsFor } from "./claims";
import { listConnectionsWithSync } from "./connections";
import { duration, fixedByAgent, fixedByWords, medianFixMinutes } from "./fix-stats";
import { ignoredKeys } from "./ignores";
import { muteFor, mutesFor, type Mute, type MuteKind } from "./mutes";
import { projectsFor, type ProjectView } from "./projects";

const DAY = 86_400_000;
/** No push for this long and a project looks ended: the clear prompt offers the whole project. */
export const ENDED_DAYS = 90;
const RECENT_FIXES = 5;

export type OpenKind = BreakKind | "connection" | "stale_push";
export type OpenLink = { label: string; href: string; external: boolean };
export type Prevent = { project: string; kind: MuteKind | null; ask: string };
export type OpenItem = {
  id: string;
  kind: OpenKind;
  project: string | null;
  title: string;
  /** What happened, from the real data. */
  happened: string;
  /** The one next step. */
  todo: string;
  owner: "you" | "agents";
  /** Who has it right now, in one line. */
  who: string;
  since: string | null;
  /** Nothing has run since it broke: nothing to do yet. */
  waiting: boolean;
  /** How many notices this row folds: repeats of one failure, or a project's suggestions. */
  count: number;
  /** Words for a coding agent, when handing it over makes sense. */
  prompt: string | null;
  /** Keys that clear it. Empty: it closes when the cause is fixed (a connection). */
  clearKeys: string[];
  jobId: string | null;
  link: OpenLink | null;
  /** The question to ask after a clear, so the same notice does not come back. */
  prevent: Prevent | null;
  /** A break the project's GitHub fix job can take now: routed, not waiting, nobody on it. */
  sendable: boolean;
};
export type RecentFix = { id: string; kind: CatchKind; project: string | null; what: string; caughtAt: string; fixedAt: string; took: string; by: string | null; byAgent: boolean };
export type OpenReport = {
  onYou: OpenItem[];
  withAgents: OpenItem[];
  recentFixes: RecentFix[];
  summary: { open: number; onYou: number; withAgents: number; fixed: number; fixedByAgents: number; medianFixMinutes: number | null; watching: number; notWatched: number; agents: number; windowDays: number };
  checkedAt: string;
};

type ProjectFact = Pick<ProjectView, "id" | "name" | "health" | "lastPushAt" | "kind" | "stalePush">;
type JobFact = Pick<JobView, "id" | "name" | "project" | "status" | "lastPingAt" | "lastNote" | "nextDueAt">;
type ConnectionFact = { id: string; provider: string; display: string; status: string; statusReason: string | null };
export type OpenInput = {
  catches: Catch[];
  claims: ClaimLike[];
  jobs: JobFact[];
  connections: ConnectionFact[];
  projects: ProjectFact[];
  mutes: Mute[];
  /** Notices the owner cleared. */
  cleared: Set<string>;
  /** Agent keys that can still be used. */
  agents: number;
  windowDays: number;
  now: number;
};

const PROVIDER: Record<string, string> = { github: "GitHub", gmail: "Gmail", vercel: "Vercel", supabase: "Supabase", cloudflare: "Cloudflare" };
const KIND_WORDS: Record<CatchKind, string> = { deploy: "failed-deploy notices", job: "job notices", site: "site-down notices", server_errors: "server-error notices", check: "check suggestions" };
const ROUTED = new Set<BreakKind>(["deploy_failed", "job_failed", "job_quiet", "job_never"]);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const short = (project: string) => project.split("/").pop() ?? project;

/** Pure: the question to ask after a clear. The whole project when it looks ended, else this kind on it. */
export function preventFor(project: string | null, kind: CatchKind, projects: ProjectFact[], now: number): Prevent | null {
  if (!project) return null;
  const p = projects.find((x) => sameProject(x.name, project));
  const name = short(project);
  if (p?.health === "archived") return { project, kind: null, ask: `Stop watching ${name}? It is archived on GitHub.` };
  const days = p?.lastPushAt ? Math.floor((now - Date.parse(p.lastPushAt)) / DAY) : null;
  if (days !== null && days >= ENDED_DAYS) return { project, kind: null, ask: `Stop watching ${name}? Nothing ${p?.kind === "host" ? "deployed" : "pushed"} in ${days} days.` };
  return { project, kind, ask: `Stop ${KIND_WORDS[kind]} on ${name}?` };
}

/** Pure: every open item, split by who has it, plus the last few fixes and the numbers on top. */
export function buildOpenItems(input: OpenInput): OpenReport {
  const { now } = input;
  const live = input.catches.filter((c) => c.status === "open" || c.status === "waiting");
  const items: OpenItem[] = [];
  const noAgent = "No agent is connected, so this one is on you.";

  // Breaks: one row per kind, project and job. Repeats of the same failure fold into the newest.
  const groups = new Map<string, Catch[]>();
  for (const c of live.filter((c) => c.kind !== "check")) {
    const key = `${c.kind}|${(c.project ?? "").toLowerCase()}|${c.jobId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const [key, list] of groups) {
    const c = [...list].sort((a, b) => b.caughtAt.localeCompare(a.caughtAt))[0];
    const job = c.jobId ? input.jobs.find((j) => j.id === c.jobId) : null;
    const kind = breakKind(c, job?.status);
    const waiting = list.every((x) => x.status === "waiting");
    const routed = ROUTED.has(kind);
    const claim = claimOn(input.claims, c.project);
    const owner = waiting || (routed && input.agents > 0) ? "agents" : "you";
    items.push({
      id: `break:${key}`,
      kind,
      project: c.project,
      title: c.what,
      happened: waiting ? (c.note ?? "Nothing has run since it broke.") : whatHappened({ kind, what: c.what, cause: c.cause, note: job?.lastNote, lastCheckIn: job?.lastPingAt, dueAt: job?.nextDueAt }, now),
      todo: waiting ? "Nothing to do yet. Its next run decides." : whatToDo(kind),
      owner,
      who: waiting ? "Waiting on its next run." : routed && !input.agents ? noAgent : routingStatus(kind, claim, now).text,
      since: list.map((x) => x.caughtAt).sort()[0],
      waiting,
      count: list.length,
      prompt: breakPrompt({ project: c.project ?? "this project", what: c.what, cause: c.cause ?? job?.lastNote ?? null, at: c.caughtAt }),
      clearKeys: [...new Set(list.map((x) => x.clearKey))],
      jobId: c.jobId ?? null,
      link: c.jobId ? { label: "Open the job", href: `/app/jobs#job-${c.jobId}`, external: false } : c.project ? { label: "Open the project", href: projectHref(c.project), external: false } : null,
      prevent: preventFor(c.project, c.kind, input.projects, now),
      sendable: routed && !waiting && !claim && Boolean(c.project),
    });
  }

  // Check suggestions: one row per project. They wait for the owner.
  const checks = new Map<string, Catch[]>();
  for (const c of live.filter((c) => c.kind === "check")) checks.set((c.project ?? "").toLowerCase(), [...(checks.get((c.project ?? "").toLowerCase()) ?? []), c]);
  for (const [key, list] of checks) {
    const c = list[0];
    items.push({
      id: `check:${key}`,
      kind: "check",
      project: c.project,
      title: list.length === 1 ? c.what : plural(list.length, "check suggestion", "check suggestions"),
      happened: list.length === 1 ? "Spooky's check of the live site found this." : list.slice(0, 3).map((x) => x.what.replace(/[.\s]+$/, "")).join(". ") + (list.length > 3 ? `, and ${list.length - 3} more.` : "."),
      todo: whatToDo("check"),
      owner: "you",
      who: routingStatus("check", null, now).text,
      since: list.map((x) => x.caughtAt).sort()[0],
      waiting: false,
      count: list.length,
      prompt: null,
      clearKeys: list.map((x) => x.clearKey),
      jobId: null,
      link: { label: plural(list.length, "Open the suggestion", "Open the suggestions").replace(/^\d+ /, ""), href: "/app/check", external: false },
      prevent: preventFor(c.project, "check", input.projects, now),
      sendable: false,
    });
  }

  // Jobs that never checked in have no alert, so no catch: they come from the job list.
  for (const j of input.jobs) {
    const clearKey = `never:${j.id}`;
    if (j.status !== "never_checked_in" || input.cleared.has(clearKey) || muteFor(input.mutes, j.project, "job") || items.some((i) => i.jobId === j.id)) continue;
    const title = `${j.name} has not checked in yet`;
    items.push({
      id: `job:${j.id}`,
      kind: "job_never",
      project: j.project,
      title,
      happened: whatHappened({ kind: "job_never", what: title }, now),
      todo: whatToDo("job_never"),
      owner: input.agents > 0 ? "agents" : "you",
      who: input.agents > 0 ? routingStatus("job_never", claimOn(input.claims, j.project), now).text : noAgent,
      since: null,
      waiting: false,
      count: 1,
      prompt: breakPrompt({ project: j.project ?? "this project", what: title }),
      clearKeys: [clearKey],
      jobId: j.id,
      link: { label: "Open the job", href: `/app/jobs#job-${j.id}`, external: false },
      prevent: preventFor(j.project, "job", input.projects, now),
      sendable: false,
    });
  }

  // A push the host never built. Nothing sends this to an agent.
  for (const p of input.projects) {
    const s = p.stalePush;
    if (!s) continue;
    const clearKey = `stale:${p.id}@${s.pushedAt}`;
    if (input.cleared.has(clearKey) || muteFor(input.mutes, p.name, "deploy")) continue;
    const title = `${s.host} has not deployed the latest push`;
    items.push({
      id: `stale:${p.id}`,
      kind: "stale_push",
      project: p.name,
      title,
      happened: `Pushed ${sinceWords(s.pushedAt, now)}. ${s.lastDeployAt ? `The last deploy was ${sinceWords(s.lastDeployAt, now)}.` : `${s.host} shows no deploy for it.`}`,
      todo: `Open ${s.host} and check why the push did not build.`,
      owner: "you",
      who: "Not sent to your agents: this one waits for you.",
      since: s.pushedAt,
      waiting: false,
      count: 1,
      prompt: breakPrompt({ project: p.name, what: title, at: s.pushedAt }),
      clearKeys: [clearKey],
      jobId: null,
      link: { label: "Open the project", href: projectHref(p.name), external: false },
      prevent: preventFor(p.name, "deploy", input.projects, now),
      sendable: false,
    });
  }

  // A connection that stopped working: Spooky is blind to what it covered until it is fixed.
  for (const c of input.connections) {
    if (c.status !== "errored") continue;
    const provider = PROVIDER[c.provider] ?? c.provider;
    items.push({
      id: `connection:${c.id}`,
      kind: "connection",
      project: null,
      title: `${provider} stopped working: ${c.display}`,
      happened: c.statusReason ? `${provider} said: ${c.statusReason}` : `Spooky can no longer read ${c.display}.`,
      todo: "Reconnect it in Settings. Until then Spooky cannot see what it covered.",
      owner: "you",
      who: "Only you can sign in again.",
      since: null,
      waiting: false,
      count: 1,
      prompt: null,
      clearKeys: [],
      jobId: null,
      link: { label: "Open Settings", href: "/app/settings#accounts", external: false },
      prevent: null,
      sendable: false,
    });
  }

  const RANK: Record<OpenKind, number> = { site_down: 0, server_errors: 1, connection: 2, deploy_failed: 3, job_failed: 4, job_quiet: 5, job_never: 6, stale_push: 7, check: 8 };
  const order = (a: OpenItem, b: OpenItem) => Number(a.waiting) - Number(b.waiting) || RANK[a.kind] - RANK[b.kind] || (b.since ?? "").localeCompare(a.since ?? "") || a.id.localeCompare(b.id);
  const onYou = items.filter((i) => i.owner === "you").sort(order);
  const withAgents = items.filter((i) => i.owner === "agents").sort(order);

  const fixed = input.catches.filter((c) => c.status === "fixed" && c.fixedAt);
  const recentFixes = [...fixed]
    .sort((a, b) => (b.fixedAt as string).localeCompare(a.fixedAt as string))
    .slice(0, RECENT_FIXES)
    .map((c) => ({ id: c.id, kind: c.kind, project: c.project, what: c.what, caughtAt: c.caughtAt, fixedAt: c.fixedAt as string, took: duration(Date.parse(c.fixedAt as string) - Date.parse(c.caughtAt)), by: fixedByWords(c), byAgent: fixedByAgent(c) }));
  const median = medianFixMinutes(fixed);
  const muted = (p: ProjectFact) => Boolean(muteFor(input.mutes, p.name));
  return {
    onYou,
    withAgents,
    recentFixes,
    summary: {
      open: items.length,
      onYou: onYou.length,
      withAgents: withAgents.length,
      fixed: fixed.length,
      fixedByAgents: fixed.filter(fixedByAgent).length,
      medianFixMinutes: median === null ? null : Math.round(median),
      watching: input.projects.filter((p) => p.health !== "archived" && !muted(p)).length,
      notWatched: input.projects.filter(muted).length,
      agents: input.agents,
      windowDays: input.windowDays,
    },
    checkedAt: new Date(now).toISOString(),
  };
}

/** Agent keys that still work: not revoked, not past their end date. */
async function liveAgentKeys(userId: string, now: number): Promise<number> {
  const rows = await getDb().select({ expiresAt: schema.apiKeys.expiresAt }).from(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)));
  return rows.filter((r) => !r.expiresAt || r.expiresAt.getTime() > now).length;
}

export async function openItemsFor(userId: string): Promise<OpenReport> {
  const now = Date.now();
  const [catches, claims, jobs, connections, projects, cleared, mutes, agents] = await Promise.all([
    catchesFor(userId),
    claimsFor(userId, now),
    listJobs(userId),
    listConnectionsWithSync(userId),
    projectsFor(userId, now),
    ignoredKeys(userId),
    mutesFor(userId),
    liveAgentKeys(userId, now),
  ]);
  return buildOpenItems({ catches: catches.catches, claims, jobs, connections, projects: projects.projects, mutes, cleared, agents, windowDays: catches.windowDays, now });
}
