/**
 * The @spookyparticles posting step, run inside the watcher (/api/cron/watch). At most one post a
 * day: the first run in the posting hour claims the day, decides once, and records the outcome.
 * Every post and every miss goes in the audit log. The keys are read by name from the environment
 * and never logged. Text only, through POST /2/tweets; no other X call exists here.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { catchesFor, MAX_CATCHES, recordDeploys } from "@/lib/catches";
import { adminEmails, pingOwnCheckin } from "@/lib/own-checkins";
import { overnightStats, overnightText } from "./overnight";
import { fetchPostedLog, oauthHeader, planXPost, xKeysShape, QUEUE, X_CHECKIN_NAME, X_KEY_NAMES, X_POST_HOUR_PT, pacificDay, pacificHour, xPostingOn, xRefusal, type XAnswer, type XKeys } from "./plan";

const X_POST_URL = "https://api.x.com/2/tweets";
const ACTOR = "system:x-post";

export function xPostDayKey(nowMs: number): string {
  return `x_post:${pacificDay(nowMs)}`;
}

export function readKeys(): XKeys | null {
  const [apiKey, apiSecret, accessToken, accessTokenSecret] = X_KEY_NAMES.map((n) => process.env[n]?.trim() ?? "");
  return apiKey && apiSecret && accessToken && accessTokenSecret ? { apiKey, apiSecret, accessToken, accessTokenSecret } : null;
}

/** Everything this step has posted, from the audit log (append-only, so the history cannot be edited away). */
export async function postedTexts(): Promise<string[]> {
  const rows = await getDb().select({ after: schema.auditLog.after }).from(schema.auditLog).where(eq(schema.auditLog.action, "x.posted"));
  return rows.map((r) => (r.after as { text?: unknown } | null)?.text).filter((t): t is string => typeof t === "string");
}

/** Our own account: the admin account (SP_ADMIN_EMAILS) with the most alerts in the last 30 days. */
export async function ourAccount(emails: string[], nowMs: number): Promise<string | { skipped: string }> {
  if (emails.length === 0) return { skipped: "no admin emails set" };
  const db = getDb();
  const users = await db.select({ id: schema.user.id }).from(schema.user).where(inArray(sql<string>`lower(${schema.user.email})`, emails));
  if (users.length === 0) return { skipped: "no admin account" };
  const since = new Date(nowMs - 30 * 86_400_000);
  const counts = await db.select({ userId: schema.alerts.userId, n: sql<number>`count(*)::int` }).from(schema.alerts)
    .where(and(inArray(schema.alerts.userId, users.map((u) => u.id)), gte(schema.alerts.createdAt, since))).groupBy(schema.alerts.userId);
  const ranked = users.map((u) => ({ id: u.id, n: counts.find((c) => c.userId === u.id)?.n ?? 0 })).sort((a, b) => b.n - a.n);
  if (ranked.length > 1 && ranked[0].n === ranked[1].n) return { skipped: `${ranked.length} admin accounts tie on alerts` };
  return ranked[0].id;
}

/** The post's own check-in: ok only for the overnight count with an id from X, fail with the reason otherwise. */
export function pingXCheckin(ok: boolean, note: string, nowMs: number): Promise<void> {
  return pingOwnCheckin(X_CHECKIN_NAME, ok, note, nowMs);
}

/**
 * Today's overnight count, from our own apps: the admin account (SP_ADMIN_EMAILS) that watches them.
 * When more than one admin account exists, the one with the most alerts in the last 30 days is ours.
 * Null on anything uncertain, with the reason in the log: no admin, a failed deploy recording, a failed
 * read, or a list that may be cut short.
 */
export async function overnightLine(nowMs: number): Promise<{ text: string | null; skipped: string | null }> {
  const skip = (why: string) => { console.warn("[x post] overnight count skipped:", why); return { text: null, skipped: why }; };
  try {
    const emails = adminEmails();
    const account = await ourAccount(emails, nowMs);
    if (typeof account !== "string") return skip(account.skipped);
    const userId = account;
    if (!(await recordDeploys(userId))) return skip("deploy failures could not be recorded");
    const report = await catchesFor(userId, { record: false });
    const capped = report.catches.length >= MAX_CATCHES;
    const stats = overnightStats(report.catches, capped, nowMs);
    if (!stats) return skip(capped ? "catches list at its cap" : "the night has not ended");
    return { text: overnightText(stats), skipped: null };
  } catch (err) {
    return skip(`read failed: ${(err as Error).message.slice(0, 160)}`);
  }
}

export type XPostResult = { status: "off" | "not_due" | "already" | "empty" | "posted" | "missed"; reason?: string } | null;

export async function runXPost(nowMs = Date.now(), opts: { countable?: boolean } = {}): Promise<XPostResult> {
  if (!xPostingOn(nowMs)) return { status: "off" };
  if (pacificHour(nowMs) !== X_POST_HOUR_PT) return { status: "not_due" };
  const db = getDb();
  const key = xPostDayKey(nowMs);
  const [claimed] = await db
    .insert(schema.systemHeartbeats)
    .values({ name: key, lastRunAt: new Date(nowMs), lastOk: false, detail: "deciding" })
    .onConflictDoNothing({ target: schema.systemHeartbeats.name })
    .returning({ name: schema.systemHeartbeats.name });
  if (!claimed) return { status: "already" };
  const record = (ok: boolean, detail: string) => db.update(schema.systemHeartbeats).set({ lastOk: ok, detail: detail.slice(0, 200) }).where(eq(schema.systemHeartbeats.name, key));

  const keys = readKeys();
  const count = opts.countable === false ? { text: null, skipped: "an earlier watcher pass failed" } : await overnightLine(nowMs);
  const overnight = count.text;
  // Written into the day's heartbeat, so a fallback day says why without the runtime log.
  const how = count.text ? "overnight count" : `queue line; count skipped: ${count.skipped}`;
  const plan = planXPost({ overnight, on: true, keysPresent: keys !== null, keysWrongKind: xKeysShape(keys) === "wrong_kind", queue: QUEUE, posted: await postedTexts(), others: await fetchPostedLog() });
  const failed = plan.checks.filter((c) => !c.ok).map((c) => c.name);

  if (plan.action === "skip" && plan.reason === "empty") {
    await record(false, "queue empty");
    await pingXCheckin(false, `nothing posted: queue empty and count skipped (${count.skipped})`, nowMs);
    return { status: "empty" };
  }
  if (plan.action === "skip" || failed.length > 0 || !keys) {
    const reason = plan.action === "skip" && plan.reason === "keys_missing" ? "keys missing"
      : plan.action === "skip" && plan.reason === "keys_wrong_kind" ? "keys look wrong: the access token is not an OAuth 1.0a token (no call to X)"
      : `check failed: ${failed.join(", ")}`;
    console.error("[x post] missed:", reason);
    await record(false, reason);
    await appendAudit({ actor: ACTOR, action: "x.post_missed", target: key, after: { reason, text: plan.text } });
    await pingXCheckin(false, `nothing posted: ${reason}`, nowMs);
    return { status: "missed", reason };
  }

  try {
    const res = await fetch(X_POST_URL, {
      method: "POST",
      headers: { authorization: oauthHeader("POST", X_POST_URL, keys), "content-type": "application/json" },
      body: JSON.stringify({ text: plan.text }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as XAnswer | null;
    if (!res.ok || !body?.data?.id) throw new Error(xRefusal(res.status, body));
    await record(true, `posted ${body.data.id} (${how})`);
    await appendAudit({ actor: ACTOR, action: "x.posted", target: `x:post:${body.data.id}`, after: { text: plan.text } });
    // A queued line keeps the feed going, but the daily post is the count: the check-in says which.
    await pingXCheckin(count.text !== null, count.text ? `posted ${body.data.id}` : `posted ${body.data.id}, a queued line: count skipped (${count.skipped})`, nowMs);
    return { status: "posted" };
  } catch (err) {
    const reason = (err as Error).message.slice(0, 160);
    // X's own words, never a key: read in the site's runtime log as well as the audit log.
    console.error("[x post] missed:", reason);
    await record(false, reason);
    await appendAudit({ actor: ACTOR, action: "x.post_missed", target: key, after: { reason, text: plan.text } });
    await pingXCheckin(false, `nothing posted: ${reason}`, nowMs);
    return { status: "missed", reason };
  }
}
