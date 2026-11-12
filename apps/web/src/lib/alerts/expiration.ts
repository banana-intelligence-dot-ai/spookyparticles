import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { appUrl } from "@/lib/env";
import { alertThreshold, type Expiration } from "@/lib/expirations/expirations";
import { deliverToAll, type DeliveryResult } from "./channels";

/** The date is part of the key so a renewed domain can alert again next year. */
export function expirationAlertKey(item: Expiration, threshold: 30 | 7 | 1, nodeId = item.project ?? item.name): string {
  return `expiration:${item.kind}:${nodeId}:${item.date}:${threshold}`;
}

/** Claim before sending, as deploy-failed does, so racing sweeps send once. */
export async function notifyExpiration(userId: string, item: Expiration, nodeId: string): Promise<"sent" | "skipped" | "failed"> {
  const threshold = alertThreshold(item);
  if (!threshold) return "skipped";
  try {
    const db = getDb();
    const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    const key = expirationAlertKey(item, threshold, nodeId);
    const subject = `${item.project ?? item.name}: ${item.kind === "domain" ? "domain registration" : item.name} expires in ${item.daysLeft} ${item.daysLeft === 1 ? "day" : "days"}`;
    const text = `${item.kind === "domain" ? item.name : `${item.project}: ${item.name}`} reaches its Vercel ${item.kind === "domain" ? "registration expiry" : "runtime deprecation"} date on ${item.date}.${item.autoRenew ? " Auto-renew is on." : ""}`;
    const link = new URL("/app/check", appUrl()).toString();
    // Claim the key first, as job alerts do, so racing sweeps send once.
    const [row] = await db.insert(schema.alerts).values({ userId, kind: "expiration", key, channel: "channels", to: person?.email ?? "", subject, payload: { item, threshold } }).onConflictDoNothing({ target: [schema.alerts.userId, schema.alerts.key] }).returning({ id: schema.alerts.id });
    if (!row) return "skipped";
    // The person's own channels (phone, Slack, Teams), or their account email when none is set.
    const results: DeliveryResult[] = await deliverToAll(userId, { subject, text, link, priority: threshold === 1 ? "high" : "default" }, item.project);
    const anyOk = results.some((r) => r.ok);
    await db.update(schema.alerts).set({ sentAt: anyOk ? new Date() : null, error: anyOk ? null : (results.map((r) => `${r.kind}: ${r.reason ?? "failed"}`).join("; ") || "no channel").slice(0, 200) }).where(eq(schema.alerts.id, row.id));
    await appendAudit({ actor: "system:alerts", userId, action: anyOk ? "alert.sent" : "alert.failed", target: `alert:${row.id}`, after: { kind: "expiration", key, channels: results.map((r) => `${r.kind}:${r.ok ? "ok" : "failed"}`) } });
    return anyOk ? "sent" : "failed";
  } catch (err) {
    console.error("[alerts] expiration", (err as Error).message);
    return "failed";
  }
}
