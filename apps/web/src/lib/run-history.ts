/**
 * Run history: the top of Schedules. For each scheduled job, the last 14 days of check-ins in
 * hourly bins, plus every miss Spooky caught (the job went quiet or a run failed) with when you
 * were alerted and when it came back. Pings are counted in SQL so a five-minute cron stays small.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const RUN_DAYS = 14;
const HOUR = 3_600_000;
export const RUN_HOURS = RUN_DAYS * 24;

/** [hour index from `since`, ok runs, failed runs]. Only hours with a check-in are sent. */
export type RunBin = [number, number, number];
export type Miss = { kind: "quiet" | "failed"; from: string; alertedAt: string; backAt: string | null; missed: number };
export type RunRow = { id: string; name: string; project: string | null; status: string; periodMinutes: number; bins: RunBin[]; misses: Miss[]; runs: number; fails: number };
export type RunHistory = {
  windowDays: number;
  since: string;
  checkedAt: string;
  jobs: RunRow[];
  summary: { runs: number; caught: number; back: number; medianBackMinutes: number | null };
};

type JobRow = { id: string; name: string; project: string | null; status: string; periodMinutes: number };
type BucketRow = { jobId: string; hour: Date; kind: string; n: number };
type AlertRow = { kind: string; key: string; payload: Record<string, unknown>; createdAt: Date; sentAt: Date | null };
export type RunInput = { jobs: JobRow[]; buckets: BucketRow[]; alerts: AlertRow[] };

/** The window ends at the top of the next hour, so the current hour is the last bin. */
export function runWindow(now: Date) {
  const end = Math.ceil(now.getTime() / HOUR) * HOUR;
  return { since: end - RUN_HOURS * HOUR, end };
}

/** job_quiet keys end in the due time to the minute ("2026-11-09T08:00"), which has a colon in it. */
export function dueFromKey(key: string): string | null {
  const parts = key.split(":");
  if (parts.length < 5) return null;
  const t = Date.parse(`${parts.slice(3).join(":")}:00Z`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Pure: bins per job and misses paired with their recovery. */
export function buildRunHistory(input: RunInput, now: Date): RunHistory {
  const { since } = runWindow(now);
  const rows = new Map<string, RunRow>(input.jobs.map((j) => [j.id, { ...j, bins: [], misses: [], runs: 0, fails: 0 }]));

  const bins = new Map<string, RunBin>();
  for (const b of input.buckets) {
    const row = rows.get(b.jobId);
    const i = Math.floor((b.hour.getTime() - since) / HOUR);
    if (!row || i < 0 || i >= RUN_HOURS) continue;
    const k = `${b.jobId}:${i}`;
    let bin = bins.get(k);
    if (!bin) {
      bin = [i, 0, 0];
      bins.set(k, bin);
      row.bins.push(bin);
    }
    // A "start" ping is a run beginning; the run counts once, on its ok or fail.
    if (b.kind === "ok") (bin[1] += b.n), (row.runs += b.n);
    else if (b.kind === "fail") (bin[2] += b.n), (row.fails += b.n);
  }

  // A quiet or failed alert opens a miss; repeats add to it; "back" closes it.
  const open = new Map<string, Miss>();
  const alerts = [...input.alerts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const a of alerts) {
    const jobId = typeof a.payload.jobId === "string" ? a.payload.jobId : null;
    const row = jobId ? rows.get(jobId) : null;
    if (!jobId || !row) continue;
    if (a.kind === "job_quiet" || a.kind === "job_failed") {
      const cur = open.get(jobId);
      if (cur) {
        if (a.kind === "job_quiet") cur.missed += 1;
        continue;
      }
      const m: Miss = {
        kind: a.kind === "job_failed" ? "failed" : "quiet",
        from: (a.kind === "job_quiet" ? dueFromKey(a.key) : null) ?? a.createdAt.toISOString(),
        alertedAt: (a.sentAt ?? a.createdAt).toISOString(),
        backAt: null,
        missed: a.kind === "job_quiet" ? 1 : 0,
      };
      open.set(jobId, m);
      row.misses.push(m);
    } else if (a.kind === "job_recovered") {
      const cur = open.get(jobId);
      if (cur) cur.backAt = a.createdAt.toISOString();
      open.delete(jobId);
    }
  }
  for (const row of rows.values()) row.misses = row.misses.filter((m) => !m.backAt || Date.parse(m.backAt) >= since);

  const shown = [...rows.values()].filter((r) => r.status !== "retired" || r.bins.length || r.misses.length);
  const openNow = (r: RunRow) => r.misses.some((m) => !m.backAt);
  const lastMiss = (r: RunRow) => Math.max(0, ...r.misses.map((m) => Date.parse(m.from)));
  shown.sort((a, b) => Number(openNow(b)) - Number(openNow(a)) || lastMiss(b) - lastMiss(a) || a.name.localeCompare(b.name));

  const misses = shown.flatMap((r) => r.misses);
  const backs = misses.filter((m) => m.backAt).map((m) => (Date.parse(m.backAt!) - Date.parse(m.from)) / 60_000).sort((a, b) => a - b);
  const mid = backs.length ? (backs.length % 2 ? backs[(backs.length - 1) / 2] : (backs[backs.length / 2 - 1] + backs[backs.length / 2]) / 2) : null;
  for (const r of shown) r.bins.sort((a, b) => a[0] - b[0]);

  return {
    windowDays: RUN_DAYS,
    since: new Date(since).toISOString(),
    checkedAt: now.toISOString(),
    jobs: shown,
    summary: { runs: shown.reduce((n, r) => n + r.runs, 0), caught: misses.length, back: backs.length, medianBackMinutes: mid === null ? null : Math.round(mid) },
  };
}

export async function runHistoryFor(userId: string, now = new Date()): Promise<RunHistory> {
  const db = getDb();
  const { since } = runWindow(now);
  const jobs = await db
    .select({ id: schema.checkinJobs.id, name: schema.checkinJobs.name, project: schema.checkinJobs.project, status: schema.checkinJobs.status, periodMinutes: schema.checkinJobs.periodMinutes })
    .from(schema.checkinJobs)
    .where(eq(schema.checkinJobs.userId, userId));
  if (!jobs.length) return buildRunHistory({ jobs: [], buckets: [], alerts: [] }, now);
  const ids = jobs.map((j) => j.id);
  const hour = sql<Date>`date_trunc('hour', ${schema.checkinPings.at})`;
  const [buckets, alerts] = await Promise.all([
    db
      .select({ jobId: schema.checkinPings.jobId, hour, kind: schema.checkinPings.kind, n: sql<number>`count(*)::int` })
      .from(schema.checkinPings)
      .where(and(inArray(schema.checkinPings.jobId, ids), gte(schema.checkinPings.at, new Date(since))))
      .groupBy(schema.checkinPings.jobId, hour, schema.checkinPings.kind),
    // A week before the window too, so a miss that started earlier and is still open shows.
    db
      .select({ kind: schema.alerts.kind, key: schema.alerts.key, payload: schema.alerts.payload, createdAt: schema.alerts.createdAt, sentAt: schema.alerts.sentAt })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.userId, userId), gte(schema.alerts.createdAt, new Date(since - 7 * 24 * HOUR)), inArray(schema.alerts.kind, ["job_quiet", "job_failed", "job_recovered"]))),
  ]);
  return buildRunHistory(
    {
      jobs,
      buckets: buckets.map((b) => ({ ...b, hour: new Date(b.hour), n: Number(b.n) })),
      alerts: alerts.map((a) => ({ ...a, payload: (a.payload ?? {}) as Record<string, unknown> })),
    },
    now,
  );
}
