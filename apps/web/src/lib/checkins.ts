/**
 * Check-ins: "did the daily thing happen?" A job hits its link when it runs. When the next
 * check-in is late by more than the grace, the job is quiet and the owner hears, once, on
 * every channel they set up; when it checks in again they hear it recovered. A job can also
 * report a failure outright (/fail) and is then down at once.
 */
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { track } from "@/lib/analytics/server";
import { appendAudit } from "@/lib/audit";
import { randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { deliverToAll, type DeliveryResult } from "./alerts/channels";
import { nextRun } from "./vercel-schedules";
import type { Probe } from "./probes";

export type StoredJobStatus = "new" | "up" | "late" | "down" | "paused" | "retired";
export type JobStatus = StoredJobStatus | "never_checked_in";
export type PingKind = "ok" | "start" | "fail";

export const MIN_PERIOD_MINUTES = 1;
export const MAX_PERIOD_MINUTES = 60 * 24 * 31;
export const NEVER_CHECKED_IN_MS = 24 * 60 * 60_000;

export type JobView = {
  id: string;
  name: string;
  project: string | null;
  owner: string | null;
  maxRunMinutes: number | null;
  minCount: number | null;
  source: "manual" | "vercel";
  path: string | null;
  schedule: string | null;
  timeZone: string | null;
  probe: Probe | null;
  evidenceState: "ok" | "not_readable" | "unavailable" | null;
  watched: boolean;
  watchNote: string | null;
  periodMinutes: number;
  graceMinutes: number;
  status: JobStatus;
  lastPingAt: string | null;
  lastPingKind: string | null;
  lastNote: string | null;
  nextDueAt: string | null;
  missCount: number;
  createdAt: string;
  /** The link the job hits. Only the owner sees it, and only through the API or their own page. */
  pingUrl: string | null;
};

export function pingUrlFor(token: string): string {
  return new URL(`/api/ping/${token}`, appUrl()).toString();
}

/** How long a new job may stay silent before it is flagged: a day, or its first period plus grace if longer. */
export function firstCheckInWindowMs(job: { periodMinutes?: number; graceMinutes?: number; schedule?: string | null; timeZone?: string | null; source?: string; createdAt?: Date }): number {
  if (job.source === "manual" && job.schedule && job.createdAt) {
    const due = nextRun(job.schedule, job.createdAt.getTime(), job.timeZone ?? "UTC");
    if (due !== null) return due - job.createdAt.getTime() + (job.graceMinutes ?? 0) * 60_000;
  }
  return Math.max(NEVER_CHECKED_IN_MS, ((job.periodMinutes ?? 0) + (job.graceMinutes ?? 0)) * 60_000);
}

export function jobDisplayStatus(job: { status: StoredJobStatus; lastPingAt: Date | null; createdAt: Date; periodMinutes?: number; graceMinutes?: number; schedule?: string | null; timeZone?: string | null; source?: string }, nowMs = Date.now()): JobStatus {
  if (job.status === "retired") return "retired";
  return job.status === "new" && !job.lastPingAt && nowMs - job.createdAt.getTime() >= firstCheckInWindowMs(job) ? "never_checked_in" : job.status;
}

/** Statuses an agent can filter on. "issues" means anything that needs a look: late, down or never checked in. */
export const JOB_STATUSES: readonly JobStatus[] = ["new", "never_checked_in", "up", "late", "down", "paused", "retired"];
export function parseStatusFilter(raw: string | null): Set<JobStatus> | null {
  if (!raw) return null;
  const out = new Set<JobStatus>();
  for (const part of raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (part === "issues") ["late", "down", "never_checked_in"].forEach((s) => out.add(s as JobStatus));
    else if ((JOB_STATUSES as readonly string[]).includes(part)) out.add(part as JobStatus);
    else return null;
  }
  return out.size ? out : null;
}

/** What the job's own check-in link may read back: its state, never other jobs or the account. */
export type JobStatusByLink = { name: string; owner: string | null; status: JobStatus; lastCheckIn: string | null; lastResult: string | null; lastNote: string | null; nextDue: string | null };

export async function jobStatusByToken(token: string, nowMs = Date.now()): Promise<JobStatusByLink | null> {
  if (!token || token.length > 200) return null;
  const [j] = await getDb().select().from(schema.checkinJobs).where(eq(schema.checkinJobs.token, token)).limit(1);
  if (!j) return null;
  const v = view(j, nowMs);
  return { name: v.name, owner: v.owner, status: v.status, lastCheckIn: v.lastPingAt, lastResult: v.lastPingKind, lastNote: v.lastNote, nextDue: v.nextDueAt };
}

export function sortJobViews<T extends { name: string; status: JobStatus }>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => Number(a.status === "retired") - Number(b.status === "retired") || a.name.localeCompare(b.name));
}

export type JobIssue = "failed" | "quiet" | "never_checked_in";

export function jobIssue(job: Pick<JobView, "status" | "lastPingKind">): JobIssue | null {
  if (job.status === "never_checked_in") return "never_checked_in";
  if (job.status === "late" || (job.status === "down" && job.lastPingKind !== "fail")) return "quiet";
  if (job.status === "down" && job.lastPingKind === "fail") return "failed";
  return null;
}

function view(j: typeof schema.checkinJobs.$inferSelect, nowMs = Date.now()): JobView {
  const status = j.status === "retired" ? "retired" : j.source === "vercel" && j.evidenceState !== "ok" ? "paused" : jobDisplayStatus(j, nowMs);
  return {
    id: j.id,
    name: j.name,
    project: j.project,
    owner: j.owner,
    maxRunMinutes: j.maxRunMinutes,
    minCount: j.minCount,
    source: j.source,
    path: j.path,
    schedule: j.schedule,
    timeZone: j.timeZone,
    probe: j.probe,
    evidenceState: j.evidenceState,
    watched: j.status !== "retired" && (j.source === "manual" || (j.status !== "paused" && j.evidenceState === "ok")),
    watchNote: j.status === "retired" ? null : j.source === "vercel" && j.evidenceState === "not_readable" ? "Found on Vercel, not watched yet. Vercel's integration cannot read request history. To watch it, add a read token for this team on Connections, or add one check-in line." : j.source === "vercel" && j.evidenceState === "unavailable" ? "Vercel request history is unavailable right now." : null,
    periodMinutes: j.periodMinutes,
    graceMinutes: j.graceMinutes,
    status,
    lastPingAt: j.lastPingAt?.toISOString() ?? null,
    lastPingKind: j.lastPingKind,
    lastNote: j.lastNote,
    nextDueAt: j.nextDueAt?.toISOString() ?? null,
    missCount: j.missCount,
    createdAt: j.createdAt.toISOString(),
    pingUrl: pingUrlFor(j.token),
  };
}

export function cleanName(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  return v.length >= 2 && v.length <= 80 ? v : null;
}

export function cleanMinutes(raw: unknown, fallback: number | null, max = MAX_PERIOD_MINUTES): number | null {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= MIN_PERIOD_MINUTES && n <= max ? n : null;
}

export function cleanOwner(raw: unknown): string | null {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, 81) || null : null;
}

export function cleanCount(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = String(raw);
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= 1_000_000_000 ? n : null;
}

export function classifyPing(kind: PingKind, count: number | null, minCount: number | null, note: string | null): { kind: PingKind; note: string | null } {
  if (kind !== "ok" || count === null || minCount === null || count >= minCount) return { kind, note };
  const reason = `ran but did nothing: count ${count}, expected at least ${minCount}`;
  return { kind: "fail", note: `${note ? `${note.slice(0, 199 - reason.length)} ` : ""}${reason}` };
}

export function isHungRun(lastPingKind: string | null, maxRunMinutes: number | null): boolean {
  return lastPingKind === "start" && maxRunMinutes !== null;
}

export function pingDueAt(kind: PingKind, periodMinutes: number, maxRunMinutes: number | null, nowMs: number, schedule?: string | null, timeZone = "UTC", source = "manual"): number {
  // A run that reports a little early still counts for the occurrence it belongs to.
  const early = Math.min(5, Math.floor(periodMinutes / 2)) * 60_000;
  if (source === "manual" && schedule && !(kind === "start" && maxRunMinutes !== null)) return nextRun(schedule, nowMs + early, timeZone) ?? nowMs + periodMinutes * 60_000;
  return nowMs + (kind === "start" && maxRunMinutes !== null ? maxRunMinutes : periodMinutes) * 60_000;
}

export function schedulePeriodMinutes(schedule: string, timeZone: string, fromMs: number): number {
  const first = nextRun(schedule, fromMs, timeZone);
  const second = first === null ? null : nextRun(schedule, first, timeZone);
  return first !== null && second !== null ? Math.max(1, Math.round((second - first) / 60_000)) : 1440;
}

export function dueState(dueMs: number, graceMinutes: number, nowMs: number): "on_time" | "late" | "quiet" {
  return nowMs <= dueMs ? "on_time" : nowMs < dueMs + graceMinutes * 60_000 ? "late" : "quiet";
}

export async function listJobs(userId: string): Promise<JobView[]> {
  const rows = await getDb().select().from(schema.checkinJobs).where(eq(schema.checkinJobs.userId, userId)).orderBy(asc(schema.checkinJobs.name));
  const nowMs = Date.now();
  return sortJobViews(rows.map((row) => view(row, nowMs)));
}

export async function getJob(userId: string, id: string): Promise<JobView | null> {
  const [j] = await getDb().select().from(schema.checkinJobs).where(and(eq(schema.checkinJobs.userId, userId), eq(schema.checkinJobs.id, id))).limit(1);
  return j ? view(j) : null;
}

export async function createJob(input: { userId: string; name: string; periodMinutes: number; graceMinutes: number; project: string | null; owner: string | null; maxRunMinutes: number | null; minCount: number | null; schedule: string | null; timeZone: string | null; probe: Probe | null; actor: string }): Promise<JobView> {
  const token = randomToken(18);
  const createdAt = new Date();
  const [j] = await getDb()
    .insert(schema.checkinJobs)
    .values({ userId: input.userId, name: input.name, token, periodMinutes: input.periodMinutes, graceMinutes: input.graceMinutes, project: input.project, owner: input.owner, maxRunMinutes: input.maxRunMinutes, minCount: input.minCount, schedule: input.schedule, timeZone: input.timeZone, probe: input.probe, createdAt, nextDueAt: input.schedule ? new Date(nextRun(input.schedule, createdAt.getTime(), input.timeZone ?? "UTC")!) : null })
    .returning();
  await appendAudit({ actor: input.actor, userId: input.userId, action: "checkin.created", target: `checkin:${j.id}`, after: { name: j.name, periodMinutes: j.periodMinutes, graceMinutes: j.graceMinutes, schedule: j.schedule, timeZone: j.timeZone, probe: j.probe } });
  return view(j);
}

export async function updateJob(userId: string, id: string, patch: { name?: string; periodMinutes?: number; graceMinutes?: number; project?: string | null; owner?: string | null; maxRunMinutes?: number | null; minCount?: number | null; schedule?: string | null; timeZone?: string | null; probe?: Probe | null; paused?: boolean; retired?: boolean }, actor: string): Promise<JobView | null> {
  const db = getDb();
  const [cur] = await db.select().from(schema.checkinJobs).where(and(eq(schema.checkinJobs.userId, userId), eq(schema.checkinJobs.id, id))).limit(1);
  if (!cur) return null;
  const set: Partial<typeof schema.checkinJobs.$inferInsert> = { updatedAt: new Date() };
  if (patch.name) set.name = patch.name;
  if (patch.periodMinutes) set.periodMinutes = patch.periodMinutes;
  if (patch.graceMinutes !== undefined) set.graceMinutes = patch.graceMinutes;
  if (patch.project !== undefined) set.project = patch.project;
  if (patch.owner !== undefined) set.owner = patch.owner;
  if (patch.maxRunMinutes !== undefined) set.maxRunMinutes = patch.maxRunMinutes;
  if (patch.minCount !== undefined) set.minCount = patch.minCount;
  if (patch.schedule !== undefined) set.schedule = patch.schedule;
  if (patch.timeZone !== undefined) set.timeZone = patch.timeZone;
  if (patch.probe !== undefined) set.probe = patch.probe;
  if (patch.paused === true) set.status = "paused";
  if (patch.paused === false && cur.status === "paused") set.status = cur.lastPingAt ? "up" : "new";
  if (patch.retired === true) set.status = "retired";
  if (patch.retired === false && cur.status === "retired") set.status = cur.lastPingKind === "fail" ? "down" : cur.lastPingAt ? "up" : "new";
  // A new period moves the next due time from the last check-in.
  if (patch.schedule !== undefined || patch.timeZone !== undefined || patch.periodMinutes !== undefined || patch.maxRunMinutes !== undefined) {
    const schedule = patch.schedule === undefined ? cur.schedule : patch.schedule;
    const zone = patch.timeZone === undefined ? cur.timeZone : patch.timeZone;
    const fromMs = cur.lastPingAt?.getTime() ?? cur.createdAt.getTime();
    set.nextDueAt = cur.source === "manual" && schedule ? new Date(nextRun(schedule, fromMs, zone ?? "UTC")!) : cur.lastPingAt ? new Date(pingDueAt(cur.lastPingKind as PingKind, patch.periodMinutes ?? cur.periodMinutes, patch.maxRunMinutes === undefined ? cur.maxRunMinutes : patch.maxRunMinutes, fromMs)) : null;
    if (cur.source === "manual" && schedule && patch.periodMinutes === undefined && (patch.schedule !== undefined || patch.timeZone !== undefined)) set.periodMinutes = schedulePeriodMinutes(schedule, zone ?? "UTC", Date.now());
  }
  const [j] = await db.update(schema.checkinJobs).set(set).where(eq(schema.checkinJobs.id, id)).returning();
  await appendAudit({ actor, userId, action: "checkin.updated", target: `checkin:${id}`, before: { status: cur.status }, after: { ...patch } });
  return view(j);
}

export async function deleteJob(userId: string, id: string, actor: string): Promise<boolean> {
  const r = await getDb().delete(schema.checkinJobs).where(and(eq(schema.checkinJobs.userId, userId), eq(schema.checkinJobs.id, id))).returning({ name: schema.checkinJobs.name });
  if (r.length) await appendAudit({ actor, userId, action: "checkin.deleted", target: `checkin:${id}`, before: { name: r[0].name } });
  return r.length > 0;
}

export async function recentPings(userId: string, id: string, limit = 20) {
  const job = await getJob(userId, id);
  if (!job) return null;
  const rows = await getDb().select().from(schema.checkinPings).where(eq(schema.checkinPings.jobId, id)).orderBy(desc(schema.checkinPings.at)).limit(limit);
  return rows.map((p) => ({ kind: p.kind, note: p.note, count: p.count, at: p.at.toISOString() }));
}

// ---------- The ping ----------

export type PingResult = { ok: true; job: JobView; recovered: boolean } | { ok: false; reason: "unknown" | "paused" };

/**
 * A check-in. `ok` and `start` mean the job is alive; `fail` means it ran and failed.
 * Recovery is when a down or late job checks in ok. The note is kept short and plain.
 */
export async function recordPing(token: string, kind: PingKind, note: string | null, nowMs = Date.now(), count: number | null = null): Promise<PingResult> {
  const db = getDb();
  const [cur] = await db.select().from(schema.checkinJobs).where(eq(schema.checkinJobs.token, token)).limit(1);
  if (!cur) return { ok: false, reason: "unknown" };
  return recordPingForJob(cur, kind, note, nowMs, count);
}

export async function recordPingById(id: string, kind: PingKind, note: string | null, nowMs = Date.now()): Promise<PingResult> {
  const [cur] = await getDb().select().from(schema.checkinJobs).where(eq(schema.checkinJobs.id, id)).limit(1);
  if (!cur) return { ok: false, reason: "unknown" };
  return recordPingForJob(cur, kind, note, nowMs, null);
}

async function recordPingForJob(cur: typeof schema.checkinJobs.$inferSelect, kind: PingKind, note: string | null, nowMs: number, count: number | null): Promise<PingResult> {
  const db = getDb();
  if (cur.status === "paused") return { ok: false, reason: "paused" };
  const now = new Date(nowMs);
  const decision = classifyPing(kind, count, cur.minCount, note ? note.replace(/\s+/g, " ").trim() : null);
  kind = decision.kind;
  const cleanNote = decision.note?.slice(0, 200) ?? null;
  await db.insert(schema.checkinPings).values({ jobId: cur.id, kind, note: cleanNote, count, at: now });
  const wasDown = cur.status === "down" || cur.status === "late";
  const wasRetired = cur.status === "retired";
  const nextStatus: JobStatus = kind === "fail" ? "down" : "up";
  const [j] = await db
    .update(schema.checkinJobs)
    .set({
      status: nextStatus,
      lastPingAt: now,
      lastPingKind: kind,
      lastNote: cleanNote,
      nextDueAt: new Date(pingDueAt(kind, cur.periodMinutes, cur.maxRunMinutes, nowMs, cur.schedule, cur.timeZone ?? "UTC", cur.source)),
      missCount: kind === "fail" ? cur.missCount : 0,
      updatedAt: now,
    })
    .where(eq(schema.checkinJobs.id, cur.id))
    .returning();
  if (wasRetired) {
    await appendAudit({ actor: "system:checkins", userId: cur.userId, action: "checkin.revived", target: `checkin:${cur.id}`, before: { status: cur.status }, after: { status: nextStatus, kind } });
  }
  if (kind === "fail") {
    await notifyJob(j, "job_failed", {
      subject: `${j.name}: run failed`,
      text: `${j.name} reported a failed run at ${now.toUTCString()}.${cleanNote ? ` Note: ${cleanNote}` : ""}${j.project ? ` Project: ${j.project}.` : ""}${j.owner ? ` Owner: ${j.owner}.` : ""}`,
      priority: "high",
      key: `job_failed:${j.id}:${now.toISOString().slice(0, 16)}`,
    });
  } else if (wasDown && cur.status === "down") {
    await notifyJob(j, "job_recovered", {
      subject: `${j.name}: back`,
      text: `${j.name} checked in again at ${now.toUTCString()} after ${cur.missCount} missed ${cur.missCount === 1 ? "check-in" : "check-ins"}.${j.owner ? ` Owner: ${j.owner}.` : ""}`,
      priority: "low",
      key: `job_recovered:${j.id}:${now.toISOString().slice(0, 16)}`,
    });
  }
  return { ok: true, job: view(j), recovered: wasDown && kind !== "fail" };
}

// ---------- The sweep ----------

/**
 * Whether the nth missed period alerts. The first miss always does. After that, only when the time
 * since the first alert crosses 1 h, 4 h or 24 h, then each further day, so a 5-minute job that
 * stops sends 4 alerts on day one instead of 288.
 */
export function shouldRealert(missCount: number, periodMinutes: number): boolean {
  if (missCount <= 1) return true;
  const before = (missCount - 2) * periodMinutes;
  const now = (missCount - 1) * periodMinutes;
  for (const t of [60, 240]) if (before < t && now >= t) return true;
  return Math.floor(now / 1440) > Math.floor(before / 1440);
}

/**
 * Called by the watcher every few minutes. A job past its due time but inside the grace is
 * "late" (no alert). Past the grace it is "down": one alert, then repeats on the back-off in
 * shouldRealert until it recovers. Jobs that never checked in stay "new" and never alert.
 */
export async function sweepQuietJobs(nowMs = Date.now(), onlyJobIds?: string[]): Promise<{ late: number; down: number }> {
  const db = getDb();
  const now = new Date(nowMs);
  const candidates = await db
    .select()
    .from(schema.checkinJobs)
    .where(and(inArray(schema.checkinJobs.status, ["up", "late", "down"]), lt(schema.checkinJobs.nextDueAt, now), ...(onlyJobIds ? [inArray(schema.checkinJobs.id, onlyJobIds)] : [or(eq(schema.checkinJobs.source, "manual"), and(eq(schema.checkinJobs.source, "vercel"), eq(schema.checkinJobs.evidenceState, "not_readable")))])));
  let late = 0;
  let down = 0;
  for (const j of candidates) {
    const due = j.nextDueAt!.getTime();
    const hung = isHungRun(j.lastPingKind, j.maxRunMinutes);
    if (dueState(due, hung ? 0 : j.graceMinutes, nowMs) === "late") {
      if (j.status === "up") {
        await db.update(schema.checkinJobs).set({ status: "late", updatedAt: now }).where(eq(schema.checkinJobs.id, j.id));
        late += 1;
      }
      continue;
    }
    // Past the grace. Alert once per missed period: the due time moves forward by one period each time.
    const missCount = j.missCount + 1;
    const nextDue = new Date(j.source === "manual" && j.schedule ? nextRun(j.schedule, due, j.timeZone ?? "UTC")! : due + j.periodMinutes * 60_000);
    await db.update(schema.checkinJobs).set({ status: "down", missCount, nextDueAt: nextDue, updatedAt: now }).where(eq(schema.checkinJobs.id, j.id));
    down += 1;
    // Repeats back off: a job that stays quiet alerts again at 1 h, 4 h and 24 h, then once a day.
    if (!shouldRealert(missCount, j.periodMinutes)) continue;
    const lastHeard = j.lastPingAt ? `last heard ${ago(nowMs - j.lastPingAt.getTime())} ago` : "never heard from";
    await notifyJob({ ...j, status: "down", missCount }, "job_quiet", {
      subject: hung ? `${j.name}: started, never finished` : missCount === 1 ? `${j.name}: quiet` : `${j.name}: still quiet (${missCount} missed)`,
      text: hung ? `${j.name} started at ${j.lastPingAt?.toUTCString() ?? "an unknown time"} and did not finish within ${j.maxRunMinutes} min.${j.project ? ` Project: ${j.project}.` : ""}${j.owner ? ` Owner: ${j.owner}.` : ""}` : `${j.name} was due ${ago(nowMs - due)} ago and has not checked in; ${lastHeard}. Expected every ${j.periodMinutes >= 60 && j.periodMinutes % 60 === 0 ? `${j.periodMinutes / 60} h` : `${j.periodMinutes} min`}, grace ${j.graceMinutes} min.${j.project ? ` Project: ${j.project}.` : ""}${j.owner ? ` Owner: ${j.owner}.` : ""}`,
      priority: missCount === 1 ? "high" : "default",
      key: `job_quiet:${j.id}:${missCount}:${new Date(due).toISOString().slice(0, 16)}`,
    });
  }
  return { late, down };
}

export function ago(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 6) / 10;
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

// ---------- Notify ----------

async function notifyJob(j: typeof schema.checkinJobs.$inferSelect, kind: "job_quiet" | "job_failed" | "job_recovered", n: { subject: string; text: string; priority: "high" | "default" | "low"; key: string }) {
  const db = getDb();
  try {
    const link = new URL("/app/jobs", appUrl()).toString();
    const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, j.userId)).limit(1);
    // Claim the key first: two sweeps racing produce one alert.
    const [row] = await db
      .insert(schema.alerts)
      .values({ userId: j.userId, kind, key: n.key, channel: "channels", to: person?.email ?? "", subject: n.subject, payload: { job: j.name, jobId: j.id, project: j.project, missCount: j.missCount } })
      .onConflictDoNothing({ target: [schema.alerts.userId, schema.alerts.key] })
      .returning({ id: schema.alerts.id });
    if (!row) return;
    const results: DeliveryResult[] = await deliverToAll(j.userId, { subject: n.subject, text: n.text, link, priority: n.priority }, j.project);
    const anyOk = results.some((r) => r.ok);
    await db
      .update(schema.alerts)
      .set({ sentAt: anyOk ? new Date() : null, error: anyOk ? null : (results.map((r) => `${r.kind}: ${r.reason ?? "failed"}`).join("; ") || "no channel").slice(0, 200), payload: sql`${schema.alerts.payload} || ${JSON.stringify({ deliveries: results })}::jsonb` })
      .where(eq(schema.alerts.id, row.id));
    await appendAudit({ actor: "system:checkins", userId: j.userId, action: anyOk ? "alert.sent" : "alert.failed", target: `alert:${row.id}`, after: { kind, job: j.name, channels: results.map((r) => `${r.kind}:${r.ok ? "ok" : "failed"}`) } });
    if (anyOk) await track(j.userId, "alert_sent", { kind });
  } catch (err) {
    console.error("[checkins] notify failed", kind, (err as Error).message);
  }
}
