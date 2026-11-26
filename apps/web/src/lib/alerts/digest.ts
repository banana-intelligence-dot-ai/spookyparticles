/**
 * The daily digest: one message each morning to the person's own channels (phone, Slack, Teams,
 * or email when none is set). What needs you now, what alerted in the last day, and how many
 * jobs are fine. It also proves the watcher is alive: a morning with no digest means look.
 * On by default; one link in the message turns it off.
 */
import { and, eq, gte, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { ago, listJobs, type JobView } from "@/lib/checkins";
import { latestNumbers, pacificDay, type LatestNumber } from "@/lib/checkin-stats";
import { webAnalyticsNumbers } from "@/lib/web-analytics-numbers";
import { appUrl } from "@/lib/env";
import { deliverToAll, type Notice } from "./channels";
import { optOutUrl } from "./deploy-failed";

/** 14:00 UTC: 6 am in California, 9 am in New York. */
export const DIGEST_HOUR_UTC = 14;

const NEEDS_YOU = new Set(["down", "late", "never_checked_in"]);
const STATUS_WORDS: Record<string, string> = { down: "down", late: "late", never_checked_in: "never checked in" };
const KIND_WORDS: Record<string, string> = {
  job_failed: "failed runs",
  job_quiet: "quiet jobs",
  deploy_failed: "failed deploys",
  site_down: "sites down",
  sitemap_page_dropped: "pages missing from sitemaps",
  sitemap_page_down: "sitemap pages down",
  sitemap_unreadable: "unreadable sitemaps",
  server_errors: "error bursts",
  expiration: "expiry warnings",
};

export type DigestInput = {
  jobs: Pick<JobView, "name" | "project" | "status" | "lastPingAt">[];
  /** Alerts sent in the last 24 hours, by kind. */
  sent: Record<string, number>;
  todayUrl: string;
  optOutUrl: string;
  nowMs: number;
  numbers?: { apps: LatestNumber[]; uncounted: string[] };
  /** Web Analytics reads the host refused this morning. */
  refused?: number;
};

function dayLabel(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${day}T12:00:00Z`)).replace(",", "");
}

/** Pure: how many apps have a number for yesterday, and whether the person expects numbers at all. */
export function numbersSummary(d: Pick<DigestInput, "numbers" | "refused" | "nowMs">): { fresh: number; expected: boolean } {
  const yesterday = pacificDay(d.nowMs, -1);
  const fresh = (d.numbers?.apps ?? []).filter((app) => app.day >= yesterday).length;
  return { fresh, expected: Boolean(d.numbers?.apps.length || d.numbers?.uncounted.length || d.refused) };
}

/** Pure: the message, or null when there is nothing to report on (no live jobs, no alerts). */
export function renderDigest(d: DigestInput): Notice | null {
  const live = d.jobs.filter((j) => j.status !== "retired" && j.status !== "paused");
  const alertKinds = Object.entries(d.sent).filter(([k, n]) => n > 0 && KIND_WORDS[k]);
  const refused = d.refused ?? 0;
  const summary = numbersSummary(d);
  const hasNumbers = summary.expected;
  if (!live.length && !alertKinds.length && !hasNumbers) return null;
  const needs = live.filter((j) => NEEDS_YOU.has(j.status));
  const fine = live.length - needs.length;
  const subject = needs.length
    ? `Spooky daily: ${needs.length} ${needs.length === 1 ? "job needs" : "jobs need"} you`
    : live.length ? `Spooky daily: all ${live.length} ${live.length === 1 ? "job" : "jobs"} fine` : "Spooky daily: numbers";
  const lines: string[] = [];
  // An empty morning is said first and plainly, never hidden under the job list.
  if (hasNumbers && summary.fresh === 0) {
    lines.push(refused
      ? `No numbers today: Vercel refused ${refused} Web Analytics ${refused === 1 ? "read" : "reads"}, and no app sent its own.`
      : "No numbers today: no app sent its own.", "");
  }
  if (needs.length) {
    lines.push("Needs you:");
    for (const j of needs.slice(0, 10)) {
      const heard = j.lastPingAt ? `last heard ${ago(d.nowMs - Date.parse(j.lastPingAt))} ago` : "never heard from";
      lines.push(`- ${j.name}${j.project ? ` (${j.project})` : ""}: ${STATUS_WORDS[j.status]}, ${heard}`);
    }
    if (needs.length > 10) lines.push(`- and ${needs.length - 10} more`);
  }
  lines.push(`Fine: ${fine} of ${live.length} ${live.length === 1 ? "job" : "jobs"}.`);
  if (hasNumbers) {
    const yesterday = pacificDay(d.nowMs, -1);
    const format = (n: number) => n.toLocaleString("en-US");
    lines.push(`Numbers for ${dayLabel(yesterday, { weekday: "long" })} (Pacific):`);
    const fresh = (d.numbers?.apps ?? []).filter((app) => app.day >= yesterday).sort((a, b) => b.mainValue - a.mainValue || a.app.localeCompare(b.app));
    if (fresh.length) lines.push(`Top: ${fresh.slice(0, 3).map((app) => `${app.app} ${format(app.mainValue)} ${app.mainName}`).join(", ")}`);
    for (const app of [...(d.numbers?.apps ?? [])].sort((a, b) => a.app.localeCompare(b.app))) {
      const week = app.week === null ? "" : ` (week ${format(app.week)})`;
      const counts = Object.entries(app.counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `, ${name} ${format(value)}`).join("");
      const stale = app.day < yesterday ? `  stale, last from ${dayLabel(app.day, { weekday: "short", month: "short", day: "numeric" })}` : "";
      lines.push(`- ${app.app}: ${app.mainName} ${format(app.mainValue)}${week}${counts}${app.utcDay ? " (UTC day)" : ""}${stale}`);
    }
    const uncounted = d.numbers?.uncounted ?? [];
    if (uncounted.length) {
      const more = uncounted.length - 10;
      lines.push(`- Not counted yet: ${uncounted.slice(0, 10).join(", ")}${more > 0 ? `, and ${more} more` : ""}`);
    }
    if (refused && summary.fresh > 0) lines.push(`- Web Analytics: Vercel refused ${refused} ${refused === 1 ? "read" : "reads"}.`);
  }
  lines.push(alertKinds.length ? `Last 24 h: ${alertKinds.map(([k, n]) => `${n} ${KIND_WORDS[k]}`).join(", ")}.` : "Last 24 h: no alerts.");
  lines.push("", `Turn this off: ${d.optOutUrl}`);
  return { subject, text: lines.join("\n"), link: d.todayUrl, priority: needs.length ? "default" : "low" };
}

/** Pure: numbers an app sent itself win over Web Analytics for the same name; counted names leave "not counted yet". */
export function mergeNumbers(sent: { apps: LatestNumber[]; uncounted: string[] }, web: LatestNumber[]): { apps: LatestNumber[]; uncounted: string[] } {
  const named = new Set(sent.apps.map((a) => a.app));
  const extra = web.filter((w) => !named.has(w.app));
  const counted = new Set([...named, ...extra.map((w) => w.app)]);
  return { apps: [...sent.apps, ...extra], uncounted: sent.uncounted.filter((u) => !counted.has(u)) };
}

export const digestKey = (nowMs: number) => `daily_digest:${new Date(nowMs).toISOString().slice(0, 10)}`;

/**
 * Called by the watcher every 5 minutes; acts in the digest hour. The day's key is claimed
 * before sending, so each person gets one digest a day.
 */
export async function sendDigests(nowMs = Date.now()): Promise<{ sent: number; skipped: number } | null> {
  const now = new Date(nowMs);
  // Any run in the digest hour may send; the day's key makes it once, even if a cron run is late.
  if (now.getUTCHours() !== DIGEST_HOUR_UTC) return null;
  const db = getDb();
  const since = new Date(nowMs - 24 * 60 * 60_000);
  const withJobs = await db.selectDistinct({ userId: schema.checkinJobs.userId }).from(schema.checkinJobs).where(ne(schema.checkinJobs.status, "retired"));
  const withAlerts = await db.selectDistinct({ userId: schema.alerts.userId }).from(schema.alerts).where(and(gte(schema.alerts.createdAt, since), inArray(schema.alerts.kind, Object.keys(KIND_WORDS) as (typeof schema.alerts.$inferSelect.kind)[])));
  const userIds = [...new Set([...withJobs, ...withAlerts].map((r) => r.userId))];
  let sent = 0;
  let skipped = 0;
  for (const userId of userIds) {
    try {
      const r = await sendDigest(userId, nowMs, since);
      if (r === "sent") sent += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      console.error("[digest]", (err as Error).message.slice(0, 160));
    }
  }
  return { sent, skipped };
}

async function sendDigest(userId: string, nowMs: number, since: Date): Promise<"sent" | "skipped" | "failed"> {
  const db = getDb();
  const [setting] = await db.select({ on: schema.alertSettings.dailyDigest }).from(schema.alertSettings).where(eq(schema.alertSettings.userId, userId)).limit(1);
  if (setting && !setting.on) return "skipped";
  const recent = await db.select({ kind: schema.alerts.kind }).from(schema.alerts).where(and(eq(schema.alerts.userId, userId), gte(schema.alerts.createdAt, since)));
  const sentByKind: Record<string, number> = {};
  for (const a of recent) sentByKind[a.kind] = (sentByKind[a.kind] ?? 0) + 1;
  const web = await webAnalyticsNumbers(userId, nowMs).catch(() => ({ rows: [], refused: 0 }));
  const input: DigestInput = {
    jobs: await listJobs(userId),
    numbers: mergeNumbers(await latestNumbers(userId), web.rows),
    refused: web.refused,
    sent: sentByKind,
    todayUrl: new URL("/app/jobs", appUrl()).toString(),
    optOutUrl: optOutUrl(userId, "daily_digest"),
    nowMs,
  };
  const notice = renderDigest(input);
  const numbers = { ...numbersSummary(input), refused: web.refused };
  if (!notice) return "skipped";
  const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  const key = digestKey(nowMs);
  const [row] = await db
    .insert(schema.alerts)
    .values({ userId, kind: "daily_digest", key, channel: "channels", to: person?.email ?? "", subject: notice.subject, payload: { sent: sentByKind, numbers } })
    .onConflictDoNothing({ target: [schema.alerts.userId, schema.alerts.key] })
    .returning({ id: schema.alerts.id });
  if (!row) return "skipped";
  const results = await deliverToAll(userId, notice);
  const anyOk = results.some((r) => r.ok);
  await db
    .update(schema.alerts)
    .set({ sentAt: anyOk ? new Date() : null, error: anyOk ? null : (results.map((r) => `${r.kind}: ${r.reason ?? "failed"}`).join("; ") || "no channel").slice(0, 200) })
    .where(eq(schema.alerts.id, row.id));
  await appendAudit({ actor: "system:alerts", userId, action: anyOk ? "alert.sent" : "alert.failed", target: `alert:${row.id}`, after: { kind: "daily_digest", key, numbers, channels: results.map((r) => `${r.kind}:${r.ok ? "ok" : "failed"}`) } });
  return anyOk ? "sent" : "failed";
}

export async function setDigestEnabled(userId: string, on: boolean, actor: string): Promise<void> {
  await getDb()
    .insert(schema.alertSettings)
    .values({ userId, dailyDigest: on })
    .onConflictDoUpdate({ target: schema.alertSettings.userId, set: { dailyDigest: on, updatedAt: new Date() } });
  await appendAudit({ actor, userId, action: on ? "alert.enabled" : "alert.disabled", target: "alert:daily_digest", after: { kind: "daily_digest", on } });
}
