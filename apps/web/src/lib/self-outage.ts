/**
 * When Spooky itself is down, check-ins cannot land, so every job due in that time looks quiet
 * through no fault of its own. The watcher notices its own gap (its last heartbeat is old) and,
 * before it judges any job, gives each job that went quiet inside the gap a fresh due time. Nobody
 * is emailed. One audit row per account and one heartbeat note say Spooky was down from X to Y.
 * Alerts the outage already caused are marked as false alarms, so they never count as catches.
 * A job that really stopped still alerts: at its next due time, judged from now.
 */
import { and, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "./audit";
import { openJobEpisodes } from "./catches";
import { pingDueAt } from "./checkins";

/** The watcher runs every 5 minutes. Three missed runs in a row is Spooky being down, not a hiccup. */
export const OUTAGE_GAP_MS = 15 * 60_000;
const LOOKBACK_MS = 14 * 86_400_000;

/** Outages that ended before this code could see them, cleaned up once. Times from the Neon suspension. */
export const PAST_OUTAGES: { from: string; to: string }[] = [{ from: "2026-11-16T02:42:00Z", to: "2026-11-16T19:45:00Z" }];

type JobRow = Pick<typeof schema.checkinJobs.$inferSelect, "id" | "userId" | "name" | "status" | "lastPingAt" | "lastPingKind" | "nextDueAt" | "periodMinutes" | "maxRunMinutes" | "schedule" | "timeZone" | "source">;
type AlertRow = { id: string; userId: string; kind: string; key: string; payload: Record<string, unknown>; createdAt: Date; sentAt: Date | null };

/** Pure: the gap since the watcher last ran, when it is long enough to be an outage. */
export function outageGap(prevRunMs: number | null, nowMs: number): { from: number; to: number } | null {
  if (prevRunMs === null || nowMs - prevRunMs <= OUTAGE_GAP_MS) return null;
  return { from: prevRunMs, to: nowMs };
}

/**
 * Pure: jobs that were fine when Spooky went down, are overdue now, have not been heard from since,
 * and did not report a failure. A job not yet due keeps its due time.
 */
export function jobsToForgive(jobs: JobRow[], openAtStart: Set<string>, fromMs: number, nowMs: number): JobRow[] {
  return jobs.filter(
    (j) =>
      ["up", "late", "down"].includes(j.status) &&
      (j.status !== "up" || (j.nextDueAt !== null && j.nextDueAt.getTime() <= nowMs)) &&
      j.lastPingAt !== null && j.lastPingAt.getTime() < fromMs && j.lastPingKind !== "fail" && !openAtStart.has(j.id),
  );
}

/**
 * Pure: quiet and back alerts the outage caused. A job's alert is false when the job was fine at
 * the start and had not been heard from between the start and the alert. Its "back" alert, made by
 * the first ping after, is false too.
 */
export function falseAlarms(alerts: AlertRow[], openAtStart: Set<string>, firstPingAfter: Map<string, number>, fromMs: number): AlertRow[] {
  return alerts.filter((a) => {
    const jobId = typeof a.payload.jobId === "string" ? a.payload.jobId : null;
    if (!jobId || openAtStart.has(jobId) || a.payload.falseAlarm || a.createdAt.getTime() < fromMs) return false;
    if (a.kind !== "job_quiet" && a.kind !== "job_recovered") return false;
    const heard = firstPingAfter.get(jobId);
    return heard === undefined || a.createdAt.getTime() <= heard + 60_000;
  });
}

/** Whether any check-in landed well inside the gap. If one did, the ping path worked and the quiet jobs really were quiet. */
async function pingsLanded(fromMs: number, toMs: number): Promise<boolean> {
  const start = fromMs + 60_000;
  const end = toMs - 10 * 60_000;
  if (end <= start) return false;
  const [row] = await getDb().select({ id: schema.checkinPings.id }).from(schema.checkinPings).where(and(gte(schema.checkinPings.at, new Date(start)), lt(schema.checkinPings.at, new Date(end)))).limit(1);
  return Boolean(row);
}

export type Forgiven = { from: string; to: string; jobs: number; alerts: number; skipped?: "pings_landed" | "done" };

/** Forgive one outage window, for every account. Safe to run twice: it skips a window it already handled. */
export async function forgiveWindow(fromMs: number, toMs: number, nowMs: number, opts: { checkPings: boolean }): Promise<Forgiven> {
  const db = getDb();
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const marker = `outage:${from.toISOString().slice(0, 16)}`;
  const base = { from: from.toISOString(), to: to.toISOString(), jobs: 0, alerts: 0 };
  const [done] = await db.select({ name: schema.systemHeartbeats.name }).from(schema.systemHeartbeats).where(eq(schema.systemHeartbeats.name, marker)).limit(1);
  if (done) return { ...base, skipped: "done" };
  if (opts.checkPings && (await pingsLanded(fromMs, toMs))) return { ...base, skipped: "pings_landed" };

  // Which jobs were already broken when Spooky went down: those stay as they are.
  const before = await db
    .select({ id: schema.alerts.id, userId: schema.alerts.userId, kind: schema.alerts.kind, key: schema.alerts.key, payload: schema.alerts.payload, createdAt: schema.alerts.createdAt, sentAt: schema.alerts.sentAt })
    .from(schema.alerts)
    .where(and(inArray(schema.alerts.kind, ["job_quiet", "job_failed", "job_recovered"]), gte(schema.alerts.createdAt, new Date(fromMs - LOOKBACK_MS)), lt(schema.alerts.createdAt, from)));
  const openAtStart = new Set(openJobEpisodes(before).keys());

  const jobs = await db
    .select({ id: schema.checkinJobs.id, userId: schema.checkinJobs.userId, name: schema.checkinJobs.name, status: schema.checkinJobs.status, lastPingAt: schema.checkinJobs.lastPingAt, lastPingKind: schema.checkinJobs.lastPingKind, nextDueAt: schema.checkinJobs.nextDueAt, periodMinutes: schema.checkinJobs.periodMinutes, maxRunMinutes: schema.checkinJobs.maxRunMinutes, schedule: schema.checkinJobs.schedule, timeZone: schema.checkinJobs.timeZone, source: schema.checkinJobs.source })
    .from(schema.checkinJobs)
    .where(and(inArray(schema.checkinJobs.status, ["up", "late", "down"]), isNotNull(schema.checkinJobs.lastPingAt), lt(schema.checkinJobs.lastPingAt, from)));
  const forgive = jobsToForgive(jobs, openAtStart, fromMs, nowMs);
  const now = new Date(nowMs);
  for (const j of forgive) {
    const nextDueAt = new Date(pingDueAt("ok", j.periodMinutes, null, nowMs, j.schedule, j.timeZone ?? "UTC", j.source));
    await db.update(schema.checkinJobs).set({ status: "up", missCount: 0, nextDueAt, updatedAt: now }).where(eq(schema.checkinJobs.id, j.id));
  }

  // Alerts the outage already caused (only when the watcher saw the gap too late, as on Nov 16).
  const after = await db
    .select({ id: schema.alerts.id, userId: schema.alerts.userId, kind: schema.alerts.kind, key: schema.alerts.key, payload: schema.alerts.payload, createdAt: schema.alerts.createdAt, sentAt: schema.alerts.sentAt })
    .from(schema.alerts)
    .where(and(inArray(schema.alerts.kind, ["job_quiet", "job_recovered"]), gte(schema.alerts.createdAt, from), lte(schema.alerts.createdAt, now)));
  let falseOnes: AlertRow[] = [];
  if (after.length) {
    const ids = [...new Set(after.map((a) => a.payload.jobId).filter((x): x is string => typeof x === "string"))];
    const pings = ids.length
      ? await db.select({ jobId: schema.checkinPings.jobId, at: sql<Date>`min(${schema.checkinPings.at})` }).from(schema.checkinPings).where(and(inArray(schema.checkinPings.jobId, ids), gte(schema.checkinPings.at, from))).groupBy(schema.checkinPings.jobId)
      : [];
    const firstPingAfter = new Map(pings.map((p) => [p.jobId, new Date(p.at).getTime()]));
    falseOnes = falseAlarms(after, openAtStart, firstPingAfter, fromMs);
    if (falseOnes.length) {
      await db.update(schema.alerts).set({ payload: sql`${schema.alerts.payload} || ${JSON.stringify({ falseAlarm: "spooky_outage" })}::jsonb` }).where(inArray(schema.alerts.id, falseOnes.map((a) => a.id)));
    }
  }

  // One audit row per account touched, and one note for the outside health check.
  const users = new Set([...forgive.map((j) => j.userId), ...falseOnes.map((a) => a.userId)]);
  for (const userId of users) {
    await appendAudit({ actor: "system:watch", userId, action: "watch.outage_forgiven", target: marker, after: { from: base.from, to: base.to, jobs: forgive.filter((j) => j.userId === userId).map((j) => j.name), falseAlarms: falseOnes.filter((a) => a.userId === userId).length } });
  }
  const detail = `Spooky was down from ${base.from} to ${base.to}. ${forgive.length} jobs given a fresh due time; ${falseOnes.length} alerts marked as false alarms.`;
  await db.insert(schema.systemHeartbeats).values({ name: marker, lastRunAt: to, lastOk: true, detail }).onConflictDoNothing();
  return { ...base, jobs: forgive.length, alerts: falseOnes.length };
}

/** Called by the watcher before it judges any job: past outages once, then the gap since its own last run. */
export async function forgiveOutages(prevRunMs: number | null, nowMs: number): Promise<Forgiven[]> {
  const out: Forgiven[] = [];
  for (const o of PAST_OUTAGES) out.push(await forgiveWindow(Date.parse(o.from), Date.parse(o.to), nowMs, { checkPings: false }));
  const gap = outageGap(prevRunMs, nowMs);
  if (gap) out.push(await forgiveWindow(gap.from, gap.to, nowMs, { checkPings: true }));
  return out.filter((f) => f.skipped !== "done");
}
