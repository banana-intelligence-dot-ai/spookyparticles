/**
 * What Spooky caught in the last 30 days, and when each one was fixed: the Today chart.
 *
 * Sources, all existing tables:
 * - alerts: job quiet or failed until back, site down until back, server errors until back.
 * - project checks: first open until the sweep saw it fixed, with the agent's PR when it reported one.
 * - deploys: a deployment node keeps only its latest state, so a failure is written down as a
 *   "deploy.caught" event when it is first seen, and "deploy.fixed" when the same node is next
 *   seen healthy, with the good deploy's own time and commit. Both happen on read (this page and
 *   the agent inbox), so a failure that starts and ends while nobody reads is not recorded, and a
 *   fix seen late carries the time of the newest good deploy.
 * - agent reads (agent.inbox_read): the first time a coding session asked about the project after
 *   it broke, and which key asked.
 */
import { and, asc, eq, gt, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { wordsFor } from "./checks/catalog";
import { CHECK_KEYS, type CheckKey } from "./checks/rules";
import { linkedRepo } from "./checks/report";
import { INBOX_READ } from "./agent-listening";
import { matchesIncidentProject } from "./incidents";
import { breakKey, ignoredKeys } from "./ignores";
import { FAILED_STATES, failedDeployments, logFacts, retiredFailureIds } from "./projects";

export const CAUGHT = "deploy.caught";
export const FIXED = "deploy.fixed";
/** Written by confirm-fix when an agent asked Spooky to check production. */
export const FIX_CONFIRMED = "fix.confirmed";
const WINDOW_DAYS = 30;
const WINDOW_MS = WINDOW_DAYS * 86_400_000;
const MAX = 200;

export type CatchKind = "deploy" | "job" | "site" | "server_errors" | "check";
/**
 * Where a catch stands. Fixed: it works again. Open: still broken. Waiting: nothing has run since
 * it broke, so there is nothing to judge yet. Retired and ignored are closed without a fix: the
 * project was archived, or the owner said it does not matter.
 */
export type CatchStatus = "fixed" | "open" | "waiting" | "retired" | "ignored";
export type FixedBy = { kind: "pr"; url: string } | { kind: "commit"; sha: string; message: string | null } | null;
export type Catch = {
  id: string;
  kind: CatchKind;
  project: string | null;
  what: string;
  caughtAt: string;
  alertedAt: string | null;
  heardAt: string | null;
  agent: string | null;
  fixedAt: string | null;
  fixedBy: FixedBy;
  /** When an agent asked Spooky to check production and production showed it fixed. */
  confirmedAt?: string | null;
  status: CatchStatus;
  /** Why a catch that is not fixed stands where it does, in plain words. */
  note: string | null;
  /** Waiting jobs: when the next run is due. */
  nextRunAt?: string | null;
  /** Deploys: the build log line that names the failure, when the host gave one. */
  cause?: string | null;
  /** Jobs: which watched job, so the view can show its last note and offer Retire. */
  jobId?: string | null;
};
export type Catches = {
  catches: Catch[];
  /** caught = fixed + open + waiting + closed. Closed is retired plus ignored. */
  summary: { caught: number; fixed: number; open: number; waiting: number; closed: number; medianFixMinutes: number | null };
  windowDays: number;
  checkedAt: string;
};

type AlertRow = { kind: string; key: string; payload: Record<string, unknown>; createdAt: Date; sentAt: Date | null };
type EventRow = { name: string; properties: Record<string, unknown>; createdAt: Date };
type CheckRow = { id: string; check: string; state: string; evidence: Record<string, unknown>; firstOpenAt: Date | null; fixedAt: Date | null; dismissedAt: Date | null; project: string | null };
type AttemptRow = { checkId: string; outcome: string | null; prUrl: string | null; takenAt: Date };
/** A watched job as it stands now, and its first good run after the open episode began. */
export type JobFact = { status: string; nextDueAt: Date | null; okAt: Date | null };
export type CatchInput = {
  alerts: AlertRow[];
  events: EventRow[];
  checks: CheckRow[];
  attempts: AttemptRow[];
  keyNames: Map<string, string>;
  /** By job id. A job missing here was deleted. Absent entirely: job state unknown, leave jobs open. */
  jobs?: Map<string, JobFact>;
  /** Failed deployment nodes whose project is retired (archived, nothing live). */
  retiredNodes?: Set<string>;
  /** Break keys the owner ignored. */
  ignored?: Set<string>;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const JOB_OPENERS = new Set(["job_quiet", "job_failed"]);

/**
 * Pure: the job episodes no recovery alert closed, by job id, with when each began. A job can come
 * back without that alert (a schedule re-read resets it), so these are checked against its runs.
 */
export function openJobEpisodes(alerts: AlertRow[]): Map<string, Date> {
  const open = new Map<string, Date>();
  for (const a of [...alerts].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) {
    const jobId = str(a.payload.jobId);
    if (!jobId) continue;
    if (JOB_OPENERS.has(a.kind) && !open.has(jobId)) open.set(jobId, a.createdAt);
    else if (a.kind === "job_recovered") open.delete(jobId);
  }
  return open;
}
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Pure: pair every break with its recovery, and attach who heard and what fixed it. */
export function buildCatches(input: CatchInput, now: Date): Catches {
  const since = now.getTime() - WINDOW_MS;
  const out: Catch[] = [];
  const alerts = [...input.alerts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const alertAt = (a: AlertRow) => (a.sentAt ?? a.createdAt).toISOString();

  // Jobs: the first quiet or failed alert opens an episode; repeats belong to it; "back" closes it.
  const openJobs = new Map<string, Catch>();
  for (const a of alerts) {
    const jobId = str(a.payload.jobId);
    if (!jobId) continue;
    if (a.kind === "job_quiet" || a.kind === "job_failed") {
      if (openJobs.has(jobId)) continue;
      const job = str(a.payload.job) ?? "A job";
      const c: Catch = { id: a.key, kind: "job", project: str(a.payload.project), what: a.kind === "job_failed" ? `${job} run failed` : `${job} went quiet`, caughtAt: a.createdAt.toISOString(), alertedAt: alertAt(a), heardAt: null, agent: null, fixedAt: null, fixedBy: null, status: "open", note: null, jobId };
      openJobs.set(jobId, c);
      out.push(c);
    } else if (a.kind === "job_recovered") {
      const c = openJobs.get(jobId);
      if (c) c.fixedAt = a.createdAt.toISOString();
      openJobs.delete(jobId);
    }
  }
  // No recovery alert: a good run since it broke is the fix; otherwise say what the job is waiting on.
  for (const [jobId, c] of input.jobs ? openJobs : []) {
    const job = input.jobs!.get(jobId);
    if (job?.okAt) c.fixedAt = job.okAt.toISOString();
    else if (!job || job.status === "retired" || job.status === "paused") {
      c.status = "retired";
      c.note = job ? `No longer watched: the job is ${job.status}.` : "No longer watched: the job was removed.";
    } else if (job.status !== "down" && job.status !== "late") {
      c.status = "waiting";
      c.note = "It has not run since it failed, so there is nothing to judge yet.";
      c.nextRunAt = iso(job.nextDueAt);
    }
  }

  // Sites and server errors: the down and back alerts share a key prefix.
  // Keys end in :down / :alert and :recovered, and the part before holds an ISO time, so cut at the last colon.
  const episode = (key: string) => key.slice(0, key.lastIndexOf(":"));
  const pairs: [string, string, CatchKind, string][] = [
    ["site_down", "site_recovered", "site", "Site down"],
    ["server_errors", "server_errors_recovered", "server_errors", "Server errors"],
  ];
  for (const [downKind, backKind, kind, what] of pairs) {
    const backs = new Map(alerts.filter((a) => a.kind === backKind).map((a) => [episode(a.key), a]));
    for (const a of alerts.filter((x) => x.kind === downKind)) {
      const back = backs.get(episode(a.key));
      const project = str(a.payload.project);
      out.push({ id: a.key, kind, project, what, caughtAt: a.createdAt.toISOString(), alertedAt: alertAt(a), heardAt: null, agent: null, fixedAt: back ? back.createdAt.toISOString() : null, fixedBy: null, status: "open", note: null });
    }
  }

  // Deploys: caught and fixed events, with the alert that went out for it when there was one.
  const fixes = new Map<string, EventRow>();
  for (const e of input.events) if (e.name === FIXED && str(e.properties.key) && !fixes.has(e.properties.key as string)) fixes.set(e.properties.key as string, e);
  const seen = new Set<string>();
  for (const e of input.events) {
    const key = str(e.properties.key);
    if (e.name !== CAUGHT || !key || seen.has(key)) continue;
    seen.add(key);
    const at = str(e.properties.at) ?? e.createdAt.toISOString();
    const project = str(e.properties.project);
    const alert = alerts.find((a) => a.kind === "deploy_failed" && str(a.payload.at) === at && matchesIncidentProject(project, str(a.payload.project) ?? ""));
    const fix = fixes.get(key);
    const sha = fix ? str(fix.properties.sha) : null;
    const nodeId = str(e.properties.nodeId);
    const closed: Pick<Catch, "status" | "note"> = fix || !nodeId
      ? { status: "open", note: null }
      : input.ignored?.has(breakKey(nodeId, at))
        ? { status: "ignored", note: "You marked this failure as not mattering." }
        : input.retiredNodes?.has(nodeId)
          ? { status: "retired", note: "The project is retired: its repo is archived and nothing of it runs in production." }
          : { status: "open", note: null };
    const cause = str(e.properties.cause);
    const where = str(e.properties.environment);
    out.push({
      id: key,
      kind: "deploy",
      project,
      what: cause ? `Deploy failed: ${cause}` : where && !/^production$/i.test(where) ? `Deploy failed (${where})` : "Deploy failed",
      caughtAt: at,
      alertedAt: alert ? alertAt(alert) : null,
      heardAt: null,
      agent: null,
      fixedAt: fix ? (str(fix.properties.at) ?? fix.createdAt.toISOString()) : null,
      fixedBy: sha ? { kind: "commit", sha, message: str(fix?.properties.message) } : null,
      cause,
      ...closed,
    });
  }

  // Checks: open until the sweep saw it fixed. The agent's PR, when it reported one, is the fix.
  for (const r of input.checks) {
    if (r.dismissedAt || !r.firstOpenAt || !(CHECK_KEYS as readonly string[]).includes(r.check)) continue;
    const fixedAt = r.state === "ok" ? r.fixedAt : null;
    if (r.state !== "open" && !fixedAt) continue;
    const pr = input.attempts
      .filter((a) => a.checkId === r.id && a.outcome === "pr_opened" && a.prUrl)
      .sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())[0];
    out.push({ id: r.id, kind: "check", project: r.project, what: wordsFor(r.check as CheckKey, r.evidence).title, caughtAt: r.firstOpenAt.toISOString(), alertedAt: null, heardAt: null, agent: null, fixedAt: iso(fixedAt), fixedBy: pr?.prUrl ? { kind: "pr", url: pr.prUrl } : null, status: "open", note: null });
  }

  // Who heard: the first agent read of the same project after it broke (and before it was fixed).
  const reads = input.events
    .filter((e) => e.name === INBOX_READ && str(e.properties.project))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const c of out) {
    if (!c.project) continue;
    const from = Date.parse(c.caughtAt);
    const until = c.fixedAt ? Date.parse(c.fixedAt) : Infinity;
    const read = reads.find((r) => r.createdAt.getTime() >= from && r.createdAt.getTime() <= until && matchesIncidentProject(c.project, r.properties.project as string));
    if (!read) continue;
    c.heardAt = read.createdAt.toISOString();
    const keyId = str(read.properties.apiKeyId);
    c.agent = keyId ? (input.keyNames.get(keyId) ?? null) : null;
  }

  // Confirmed: the first time production checked out fixed for the project, after it broke.
  const confirms = input.events
    .filter((e) => e.name === FIX_CONFIRMED && e.properties.verdict === "fixed" && str(e.properties.project))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const c of out) {
    if (!c.project || !c.fixedAt) continue;
    const hit = confirms.find((e) => e.createdAt.getTime() >= Date.parse(c.caughtAt) && matchesIncidentProject(c.project, e.properties.project as string));
    if (hit) c.confirmedAt = hit.createdAt.toISOString();
  }

  for (const c of out) if (c.fixedAt) c.status = "fixed";
  const inWindow = out.filter((c) => (c.fixedAt ? Date.parse(c.fixedAt) : now.getTime()) >= since);
  const rank: Record<CatchStatus, number> = { open: 0, waiting: 1, fixed: 2, retired: 3, ignored: 3 };
  const catches = inWindow
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.fixedAt && b.fixedAt ? b.fixedAt.localeCompare(a.fixedAt) : b.caughtAt.localeCompare(a.caughtAt)))
    .slice(0, MAX);
  const durations = catches.filter((c) => c.fixedAt).map((c) => (Date.parse(c.fixedAt as string) - Date.parse(c.caughtAt)) / 60_000).filter((m) => m >= 0).sort((a, b) => a - b);
  const mid = durations.length >> 1;
  const median = durations.length ? (durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2) : null;
  const count = (...s: CatchStatus[]) => catches.filter((c) => s.includes(c.status)).length;
  return {
    catches,
    summary: { caught: catches.length, fixed: count("fixed"), open: count("open"), waiting: count("waiting"), closed: count("retired", "ignored"), medianFixMinutes: median === null ? null : Math.round(median) },
    windowDays: WINDOW_DAYS,
    checkedAt: now.toISOString(),
  };
}

/**
 * Write down deploy failures as they are first seen, and their fix when the same deployment is
 * next seen healthy. Quiet on failure: the chart matters less than the read that triggered it.
 */
export async function recordDeploys(userId: string, nowMs = Date.now()) {
  try {
    const db = getDb();
    const since = new Date(nowMs - WINDOW_MS - 86_400_000);
    const [failing, logged] = await Promise.all([
      failedDeployments(userId, nowMs),
      db.select({ name: schema.events.name, properties: schema.events.properties }).from(schema.events)
        .where(and(eq(schema.events.userId, userId), inArray(schema.events.name, [CAUGHT, FIXED]), gte(schema.events.createdAt, since))),
    ]);
    const caught = new Map(logged.filter((e) => e.name === CAUGHT).map((e) => [e.properties.key as string, e.properties]));
    const fixed = new Set(logged.filter((e) => e.name === FIXED).map((e) => e.properties.key as string));

    const fresh = failing
      .filter((d) => d.at && !caught.has(`deploy:${d.id}:${d.at}`))
      .map((d) => ({ userId, name: CAUGHT, properties: { key: `deploy:${d.id}:${d.at}`, nodeId: d.id, project: d.name.replace(/\s+\(.*\)$/, ""), at: d.at, cause: d.cause, environment: d.environment || null, provider: d.provider } }));
    if (fresh.length) await db.insert(schema.events).values(fresh);

    const stillFailing = new Set(failing.map((d) => d.id));
    const waiting = [...caught.entries()].filter(([key, p]) => !fixed.has(key) && typeof p.nodeId === "string" && !stillFailing.has(p.nodeId));
    if (!waiting.length) return;
    const nodes = await db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), inArray(schema.nodes.id, waiting.map(([, p]) => p.nodeId as string))));
    const rows = waiting.flatMap(([key, p]) => {
      const node = nodes.find((n) => n.id === p.nodeId);
      if (!node?.lastActivityAt || FAILED_STATES.has(node.status ?? "") || node.lastActivityAt.getTime() <= Date.parse(p.at as string)) return [];
      const facts = logFacts(node.attributes as Record<string, unknown>);
      return [{ userId, name: FIXED, properties: { key, at: node.lastActivityAt.toISOString(), sha: facts.sha, message: facts.message } }];
    });
    if (rows.length) await db.insert(schema.events).values(rows);
  } catch (err) {
    console.warn("deploy catches not recorded", err instanceof Error ? err.message : err);
  }
}

export async function catchesFor(userId: string): Promise<Catches> {
  await recordDeploys(userId);
  const db = getDb();
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_MS);
  const [alerts, events, checkRows, attempts] = await Promise.all([
    db.select({ kind: schema.alerts.kind, key: schema.alerts.key, payload: schema.alerts.payload, createdAt: schema.alerts.createdAt, sentAt: schema.alerts.sentAt }).from(schema.alerts)
      .where(and(eq(schema.alerts.userId, userId), gte(schema.alerts.createdAt, new Date(since.getTime() - WINDOW_MS)), inArray(schema.alerts.kind, ["deploy_failed", "job_quiet", "job_failed", "job_recovered", "site_down", "site_recovered", "server_errors", "server_errors_recovered"]))),
    db.select({ name: schema.events.name, properties: schema.events.properties, createdAt: schema.events.createdAt }).from(schema.events)
      .where(and(eq(schema.events.userId, userId), inArray(schema.events.name, [CAUGHT, FIXED, INBOX_READ, FIX_CONFIRMED]), gte(schema.events.createdAt, new Date(since.getTime() - WINDOW_MS)))),
    db.select({ check: schema.projectChecks, node: schema.nodes }).from(schema.projectChecks).innerJoin(schema.nodes, eq(schema.nodes.id, schema.projectChecks.nodeId))
      .where(and(eq(schema.projectChecks.userId, userId), gte(schema.projectChecks.checkedAt, since))),
    db.select({ checkId: schema.checkAttempts.checkId, outcome: schema.checkAttempts.outcome, prUrl: schema.checkAttempts.prUrl, takenAt: schema.checkAttempts.takenAt }).from(schema.checkAttempts)
      .where(and(eq(schema.checkAttempts.userId, userId), gte(schema.checkAttempts.takenAt, new Date(since.getTime() - WINDOW_MS)))),
  ]);
  const openJobs = openJobEpisodes(alerts);
  const fixedKeys = new Set(events.filter((e) => e.name === FIXED).map((e) => str(e.properties.key)));
  const unfixedNodes = [...new Set(events.filter((e) => e.name === CAUGHT && !fixedKeys.has(str(e.properties.key))).map((e) => str(e.properties.nodeId)).filter((x): x is string => Boolean(x)))];
  const [jobs, retiredNodes, ignored] = await Promise.all([
    jobFacts(userId, openJobs),
    retiredFailureIds(userId, unfixedNodes, now.getTime()),
    ignoredKeys(userId),
  ]);
  const keyIds = [...new Set(events.map((e) => str(e.properties.apiKeyId)).filter((x): x is string => Boolean(x)))];
  const keys = keyIds.length ? await db.select({ id: schema.apiKeys.id, name: schema.apiKeys.name }).from(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), inArray(schema.apiKeys.id, keyIds))) : [];
  const checks: CheckRow[] = checkRows.map(({ check: c, node }) => ({ id: c.id, check: c.check, state: c.state, evidence: c.evidence, firstOpenAt: c.firstOpenAt, fixedAt: c.fixedAt, dismissedAt: c.dismissedAt, project: linkedRepo(node) ?? node.name }));
  return buildCatches({ alerts, events, checks, attempts, keyNames: new Map(keys.map((k) => [k.id, k.name])), jobs, retiredNodes, ignored }, now);
}

/** Each job with an open episode: how it stands, and its first good run since the episode began. */
async function jobFacts(userId: string, open: Map<string, Date>): Promise<Map<string, JobFact>> {
  if (!open.size) return new Map();
  const db = getDb();
  const rows = await db.select({ id: schema.checkinJobs.id, status: schema.checkinJobs.status, nextDueAt: schema.checkinJobs.nextDueAt }).from(schema.checkinJobs)
    .where(and(eq(schema.checkinJobs.userId, userId), inArray(schema.checkinJobs.id, [...open.keys()])));
  const firstOk = await Promise.all(rows.map(async (j) => {
    const [p] = await db.select({ at: schema.checkinPings.at }).from(schema.checkinPings)
      .where(and(eq(schema.checkinPings.jobId, j.id), eq(schema.checkinPings.kind, "ok"), gt(schema.checkinPings.at, open.get(j.id)!)))
      .orderBy(asc(schema.checkinPings.at)).limit(1);
    return p?.at ?? null;
  }));
  return new Map(rows.map((j, i) => [j.id, { status: j.status, nextDueAt: j.nextDueAt, okAt: firstOk[i] }]));
}
