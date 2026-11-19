/** The same alert channel and deploy opt-out path used for failed Vercel builds. */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
import { alertMuted } from "@/lib/mutes";
import { ignoredKeys } from "@/lib/ignores";
import { pushAlertKey } from "@/lib/push-no-deploy";
import type { LinkedPushFinding } from "@/lib/push-no-deploy-store";
import { deliverToAll } from "./channels";
import { deployFailedEnabled, optOutUrl } from "./deploy-failed";

export async function notifyPushNotDeployed(userId: string, f: LinkedPushFinding): Promise<"sent" | "skipped" | "failed"> {
  try {
    if (!(await deployFailedEnabled(userId)) || await alertMuted(userId, f.project, "push_not_deployed")) return "skipped";
    const db = getDb();
    const key = pushAlertKey(f.project, f.sha);
    if ((await ignoredKeys(userId)).has(key)) return "skipped";
    const [prior] = await db.select({ id: schema.alerts.id }).from(schema.alerts).where(and(eq(schema.alerts.userId, userId), eq(schema.alerts.key, key))).limit(1);
    if (prior) return "skipped";
    const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    const subject = `${f.project}: commit ${f.sha.slice(0, 7)} has no Vercel deployment`;
    const cause = `Pushed to ${f.branch} ${f.minutesSince} minutes ago and Vercel has no deployment for it. The Git link may be broken: check the project's Git settings in Vercel.`;
    const text = [subject, f.message ? `Commit: ${f.sha} ${f.message}` : `Commit: ${f.sha}`, cause,
      `Open on Spooky Particles: ${new URL("/app", appUrl())}`,
      `Stop deploy alerts: ${optOutUrl(userId, "deploy_failed")}`].join("\n\n");
    // The unique key is claimed before delivery, including when two syncs race.
    const [row] = await db.insert(schema.alerts).values({ userId, kind: "push_not_deployed", key, channel: "channels", to: person?.email ?? "", subject, payload: { project: f.project, sha: f.sha, message: f.message, at: f.at, branch: f.branch, cause } })
      .onConflictDoNothing({ target: [schema.alerts.userId, schema.alerts.key] }).returning({ id: schema.alerts.id });
    if (!row) return "skipped";
    const results = await deliverToAll(userId, { subject, text, priority: "high" }, f.project);
    const sent = results.some((r) => r.ok);
    await db.update(schema.alerts).set(sent ? { sentAt: new Date() } : { error: (results.map((r) => `${r.kind}: ${r.reason ?? "failed"}`).join("; ") || "no channel").slice(0, 200) }).where(eq(schema.alerts.id, row.id));
    await appendAudit({ actor: "system:alerts", userId, action: sent ? "alert.sent" : "alert.failed", target: `alert:${row.id}`, after: { kind: "push_not_deployed", project: f.project, channels: results.map((r) => `${r.kind}:${r.ok ? "ok" : "failed"}`) } });
    return sent ? "sent" : "failed";
  } catch (err) {
    console.error("[alerts] push_not_deployed", (err as Error).message);
    return "failed";
  }
}
