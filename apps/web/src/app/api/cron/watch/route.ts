/**
 * GET /api/cron/watch: Vercel Cron calls this on a schedule (apps/web/vercel.json) so host
 * failures reach the map and the alert email without anyone looking. It starts a resync
 * for every active Vercel connection older than five minutes and GitHub connection older than ten, that
 * has no sync running. Protected by CRON_SECRET, which Vercel sends as a bearer token.
 */
import { and, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema } from "@/db";
import { sweepQuietJobs } from "@/lib/checkins";
import { executeDueDeletions, purgeRevokedConnectionData } from "@/lib/purge";
import { json } from "@/lib/http";
import { resyncHostsQuietly } from "@/lib/sync";
import { sweepServerErrors, sweepUptime } from "@/lib/vercel-monitor";
import { sweepVercelSchedules } from "@/lib/vercel-watch";
import { sweepChecks } from "@/lib/checks/sweep";

export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: { code: "not_configured", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: { code: "unauthorized" } }, { status: 401 });
  const rows = await getDb()
    .select()
    .from(schema.connections)
    .where(and(inArray(schema.connections.provider, ["vercel", "github"]), eq(schema.connections.status, "active")));
  // Vercel schedules first: a job whose history turned unreadable is set to wait before the
  // general sweep could alert on it. Then quiet jobs, then the host resync.
  let ok = true;
  let detail: string | null = null;
  let schedules: Awaited<ReturnType<typeof sweepVercelSchedules>> | null = null;
  let jobs: Awaited<ReturnType<typeof sweepQuietJobs>> | null = null;
  let errors: Awaited<ReturnType<typeof sweepServerErrors>> | null = null;
  let uptime: Awaited<ReturnType<typeof sweepUptime>> | null = null;
  let checks: Awaited<ReturnType<typeof sweepChecks>> | null = null;
  try {
    schedules = await sweepVercelSchedules();
    jobs = await sweepQuietJobs();
  } catch (err) {
    ok = false;
    detail = (err as Error).message.slice(0, 200);
    console.error("[watch] sweep failed", detail);
  }
  // The passes below are extras. A failure in one is logged and noted, but it does not mark the
  // watcher unhealthy: the health page is about the job that judges other jobs.
  const note = (what: string, err: unknown) => {
    const message = (err as Error).message.slice(0, 160);
    console.error(`[watch] ${what} failed`, message);
    detail = detail ?? `${what}: ${message}`;
  };
  try { errors = await sweepServerErrors(); } catch (err) { note("error rate sweep", err); }
  try { uptime = await sweepUptime(); } catch (err) { note("uptime sweep", err); }
  try { checks = await sweepChecks(); } catch (err) { note("check sweep", err); }
  try { await resyncHostsQuietly(rows); } catch (err) { note("host resync", err); }
  // Promised deletions, once an hour: data from connections revoked 30 days ago, and accounts
  // whose deletion grace period has passed.
  let purged: { connections: Record<string, number>; accounts: { accounts: number; rows: number } } | null = null;
  if (new Date().getUTCMinutes() < 5) {
    try { purged = { connections: await purgeRevokedConnectionData(Date.now()), accounts: await executeDueDeletions(Date.now()) }; }
    catch (err) { note("purge", err); }
  }
  // The heartbeat an outside check reads (/api/health/watch). Written even when the sweep failed.
  const at = new Date();
  try {
    await getDb()
      .insert(schema.systemHeartbeats)
      .values({ name: "watch", lastRunAt: at, lastOk: ok, detail })
      .onConflictDoUpdate({ target: schema.systemHeartbeats.name, set: { lastRunAt: at, lastOk: ok, detail } });
  } catch (err) {
    // A missing table (migration not applied yet) must not fail the sweep that just ran.
    console.error("[watch] heartbeat not written", (err as Error).message.slice(0, 120));
  }
  return json({ ok, connections: rows.length, jobs, schedules, errors, uptime, checks, at: at.toISOString(), purged }, { status: ok ? 200 : 500 });
}
