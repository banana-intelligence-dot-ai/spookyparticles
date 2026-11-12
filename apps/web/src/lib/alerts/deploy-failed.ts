/**
 * The failed-deploy alert: one email per failed deployment, within minutes of the host
 * showing it, with the line from the build log that names the failure, the last lines
 * of the log, and where to act. Never sent twice for the same deployment; never sent
 * for a failure older than FRESH_MS (a first connection must not mail a year of history);
 * never sent to someone who turned it off.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { track } from "@/lib/analytics/server";
import { appendAudit } from "@/lib/audit";
import { parseMasterKey } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { sendEmail } from "./email";

/** Failures older than this at first sight are history, not news. */
export const FRESH_MS = 24 * 60 * 60 * 1000;
/** Lines of the log in the email. The API has the full tail. */
const EMAIL_LOG_LINES = 15;

export type DeployFailure = {
  deploymentId: string;
  project: string;
  environment: "production" | "preview";
  host: string;
  at: string | null;
  cause: string | null;
  logTail: string[];
  inspectorUrl: string | null;
  url: string | null;
};

export const alertKey = (f: Pick<DeployFailure, "deploymentId">) => `deploy_failed:${f.deploymentId}`;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Subject and both bodies. Pure, so the words can be tested and read in the repo. */
export function renderDeployFailed(f: DeployFailure, opts: { todayUrl: string; unsubscribeUrl: string }) {
  const short = f.project.split("/").pop() ?? f.project;
  const subject = `${short}: ${f.environment} deploy failed on ${f.host}`;
  const when = f.at ? new Date(f.at).toUTCString() : "just now";
  const tail = f.logTail.slice(-EMAIL_LOG_LINES);
  const lines = [
    `${f.project}: the ${f.environment} deploy on ${f.host} failed (${when}).`,
    "",
    f.cause ? `Why, from the build log:\n  ${f.cause}` : "The build log did not name a cause. The last lines are below.",
    "",
    tail.length ? `Last ${tail.length} lines of the log:\n${tail.map((l) => `  ${l}`).join("\n")}` : "No log lines were available.",
    "",
    f.inspectorUrl ? `Open the build on ${f.host}: ${f.inspectorUrl}` : null,
    `Today on Spooky Particles: ${opts.todayUrl}`,
    "",
    "Spooky Particles only reads. Nothing was changed, redeployed or rolled back.",
    "Replies to this address are not read; write to hello@spookyparticles.com.",
    `Stop these emails: ${opts.unsubscribeUrl}`,
  ].filter((l): l is string => l !== null);
  const text = lines.join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0c0d0f;color:#e6e7e9;font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<p style="margin:0 0 16px"><strong style="font-weight:600">${escapeHtml(f.project)}</strong>: the ${f.environment} deploy on ${escapeHtml(f.host)} failed.<br><span style="color:#9a9ca1">${escapeHtml(when)}</span></p>
${f.cause ? `<p style="margin:0 0 6px;color:#9a9ca1">Why, from the build log</p><pre style="margin:0 0 16px;padding:12px;background:#15171a;border:1px solid #23262b;border-radius:8px;white-space:pre-wrap;word-break:break-word;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#f2b8b5">${escapeHtml(f.cause)}</pre>` : `<p style="margin:0 0 16px;color:#9a9ca1">The build log did not name a cause. The last lines are below.</p>`}
${tail.length ? `<p style="margin:0 0 6px;color:#9a9ca1">Last ${tail.length} lines of the log</p><pre style="margin:0 0 16px;padding:12px;background:#15171a;border:1px solid #23262b;border-radius:8px;white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9cbd0">${escapeHtml(tail.join("\n"))}</pre>` : ""}
<p style="margin:0 0 16px">${f.inspectorUrl ? `<a href="${escapeHtml(f.inspectorUrl)}" style="color:#e6e7e9">Open the build on ${escapeHtml(f.host)}</a> &nbsp;·&nbsp; ` : ""}<a href="${escapeHtml(opts.todayUrl)}" style="color:#e6e7e9">Today on Spooky Particles</a></p>
<p style="margin:0;color:#6f7177;font-size:13px">Spooky Particles only reads. Nothing was changed, redeployed or rolled back. Replies to this address are not read; write to hello@spookyparticles.com.<br><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#6f7177">Stop these emails</a></p>
</body></html>`;
  return { subject, text, html };
}

// ---------- The opt-out link ----------

function optOutSecret(env: Record<string, string | undefined> = process.env): Buffer {
  return createHmac("sha256", parseMasterKey(env.SP_MASTER_KEY)).update("alerts:opt-out").digest();
}

/** A token tied to one user and one alert kind, signed with a key derived from the master key. */
export function optOutToken(userId: string, kind: "deploy_failed", env?: Record<string, string | undefined>): string {
  return createHmac("sha256", optOutSecret(env)).update(`${userId}:${kind}`).digest("base64url");
}

export function optOutTokenValid(userId: string, kind: "deploy_failed", token: string, env?: Record<string, string | undefined>): boolean {
  const expected = Buffer.from(optOutToken(userId, kind, env));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function optOutUrl(userId: string, kind: "deploy_failed"): string {
  const u = new URL("/api/alerts/opt-out", appUrl());
  u.searchParams.set("u", userId);
  u.searchParams.set("k", kind);
  u.searchParams.set("t", optOutToken(userId, kind));
  return u.toString();
}

// ---------- Sending ----------

export async function deployFailedEnabled(userId: string): Promise<boolean> {
  const [row] = await getDb().select({ on: schema.alertSettings.deployFailed }).from(schema.alertSettings).where(eq(schema.alertSettings.userId, userId)).limit(1);
  return row ? row.on : true;
}

export async function setDeployFailedEnabled(userId: string, on: boolean, actor: string): Promise<void> {
  await getDb()
    .insert(schema.alertSettings)
    .values({ userId, deployFailed: on })
    .onConflictDoUpdate({ target: schema.alertSettings.userId, set: { deployFailed: on, updatedAt: new Date() } });
  await appendAudit({ actor, userId, action: on ? "alert.enabled" : "alert.disabled", target: `alert:deploy_failed`, after: { kind: "deploy_failed", on } });
}

/**
 * Send the alert for a failure seen now, unless it was sent before, is older than FRESH_MS,
 * or the person turned it off. Never throws: a sync must not fail because mail did.
 */
export async function notifyDeployFailed(userId: string, f: DeployFailure, nowMs = Date.now()): Promise<"sent" | "skipped" | "failed"> {
  try {
    if (f.at && nowMs - Date.parse(f.at) > FRESH_MS) return "skipped";
    if (!(await deployFailedEnabled(userId))) return "skipped";
    const db = getDb();
    const key = alertKey(f);
    const [prior] = await db.select({ id: schema.alerts.id }).from(schema.alerts).where(and(eq(schema.alerts.userId, userId), eq(schema.alerts.key, key))).limit(1);
    if (prior) return "skipped";
    const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    if (!person?.email) return "skipped";

    const rendered = renderDeployFailed(f, { todayUrl: new URL("/app", appUrl()).toString(), unsubscribeUrl: optOutUrl(userId, "deploy_failed") });
    const payload = { project: f.project, environment: f.environment, host: f.host, at: f.at, cause: f.cause, deploymentId: f.deploymentId, inspectorUrl: f.inspectorUrl, logLines: f.logTail.slice(-EMAIL_LOG_LINES) };
    // Claim the key first: two syncs racing on the same failure produce one email.
    const [row] = await db
      .insert(schema.alerts)
      .values({ userId, kind: "deploy_failed", key, channel: "email", to: person.email, subject: rendered.subject, payload })
      .onConflictDoNothing({ target: [schema.alerts.userId, schema.alerts.key] })
      .returning({ id: schema.alerts.id });
    if (!row) return "skipped";

    const sent = await sendEmail({ to: person.email, ...rendered });
    await db
      .update(schema.alerts)
      .set(sent.ok ? { sentAt: new Date() } : { error: sent.reason.slice(0, 200) })
      .where(eq(schema.alerts.id, row.id));
    await appendAudit({ actor: "system:alerts", userId, action: sent.ok ? "alert.sent" : "alert.failed", target: `alert:${row.id}`, after: { kind: "deploy_failed", project: f.project, environment: f.environment, ...(sent.ok ? {} : { reason: sent.reason }) } });
    if (sent.ok) await track(userId, "alert_sent", { kind: "deploy_failed" });
    return sent.ok ? "sent" : "failed";
  } catch (err) {
    console.error("[alerts] deploy_failed", (err as Error).message);
    return "failed";
  }
}
