/**
 * GET /api/cron/watch: Vercel Cron calls this on a schedule (apps/web/vercel.json) so host
 * failures reach the map and the alert email without anyone looking. It checks active
 * Vercel connections every five minutes, starts full inventories on changes and hourly,
 * checks GitHub every fifteen minutes, and re-reads each inbox daily. Protected by
 * CRON_SECRET, which Vercel sends as a bearer token.
 */
import { and, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema } from "@/db";
import { sweepQuietJobs } from "@/lib/checkins";
import { runDueProbes } from "@/lib/probes";
import { executeDueDeletions, purgeRevokedConnectionData } from "@/lib/purge";
import { json } from "@/lib/http";
import { rereadMailDaily, resyncHostsQuietly } from "@/lib/sync";
import { pushNoDeployFor } from "@/lib/push-no-deploy-store";
import { notifyPushNotDeployed } from "@/lib/alerts/push-not-deployed";
import { sweepServerErrors, sweepUptime } from "@/lib/vercel-monitor";
import { sweepSitemaps } from "@/lib/sitemap-check";
import { sweepVercelSchedules } from "@/lib/vercel-watch";
import { sweepChecks } from "@/lib/checks/sweep";
import { sendDigests } from "@/lib/alerts/digest";
import { escalatePages, pagerEnabled } from "@/lib/pager";
import { forgiveOutages, type Forgiven } from "@/lib/self-outage";
import { escalateAgentAlerts } from "@/lib/agent-first";

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
  let probes: Awaited<ReturnType<typeof runDueProbes>> | null = null;
  let jobs: Awaited<ReturnType<typeof sweepQuietJobs>> | null = null;
  let errors: Awaited<ReturnType<typeof sweepServerErrors>> | null = null;
  let uptime: Awaited<ReturnType<typeof sweepUptime>> | null = null;
  let sitemaps: Awaited<ReturnType<typeof sweepSitemaps>> | null = null;
  let checks: Awaited<ReturnType<typeof sweepChecks>> | null = null;
  let outages: Forgiven[] = [];
  try {
    // Spooky's own outage first: jobs that went quiet only because their check-ins could not land
    // get a fresh due time before the sweep below could alert on them.
    const [hb] = await getDb().select({ lastRunAt: schema.systemHeartbeats.lastRunAt }).from(schema.systemHeartbeats).where(eq(schema.systemHeartbeats.name, "watch")).limit(1);
    outages = await forgiveOutages(hb?.lastRunAt.getTime() ?? null, Date.now());
    schedules = await sweepVercelSchedules();
    probes = await runDueProbes();
    jobs = await sweepQuietJobs();
    if (pagerEnabled()) await escalatePages();
    await escalateAgentAlerts();
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
  try { sitemaps = await sweepSitemaps(); } catch (err) { note("sitemap sweep", err); }
  // Its work is dated in days (expiry notices, weekly scans, daily dependency reads), so once an hour is enough.
  if (new Date().getUTCMinutes() < 5) { try { checks = await sweepChecks(); } catch (err) { note("check sweep", err); } }
  try { await resyncHostsQuietly(rows); } catch (err) { note("host resync", err); }
  // Keep the push-with-no-deploy alert on its five-minute cadence when an unchanged
  // Vercel deployment fingerprint skips the inventory workflow.
  try {
    for (const userId of new Set(rows.filter((row) => row.provider === "vercel").map((row) => row.userId))) {
      for (const finding of await pushNoDeployFor(userId)) await notifyPushNotDeployed(userId, finding);
    }
  } catch (err) { note("push with no deploy", err); }
  // Mail, once a day per inbox: only what arrived since the last read.
  let mail: Awaited<ReturnType<typeof rereadMailDaily>> | null = null;
  try { mail = await rereadMailDaily(); } catch (err) { note("mail re-read", err); }
  // The morning digest, once a day in the digest hour.
  let digest: Awaited<ReturnType<typeof sendDigests>> = null;
  try { digest = await sendDigests(); } catch (err) { note("digest", err); }
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
  return json({ ok, connections: rows.length, mail, jobs, outages, schedules, probes, errors, uptime, sitemaps, checks, digest, at: at.toISOString(), purged }, { status: ok ? 200 : 500 });
}
