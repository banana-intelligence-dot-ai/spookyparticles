/**
 * GET /api/health/watch: has our own watcher run lately? Public on purpose and tiny: a time and
 * a yes or no, nothing about any account. A script outside this product polls it, because a
 * watcher cannot be trusted to report its own death. 200 when healthy, 503 when not.
 */
import { and, eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema } from "@/db";
import { digestKey, DIGEST_HOUR_UTC } from "@/lib/alerts/digest";
import { digestHealth, watchHealth, type DigestHealth } from "@/lib/health";
import { X_POST_HOUR_PT, pacificHour, xKeysShape, xPostingOn } from "@/lib/x-posts/plan";
import { readKeys, xPostDayKey } from "@/lib/x-posts/run";

export async function GET() {
  await connection();
  const nowMs = Date.now();
  let body: ReturnType<typeof watchHealth> | { ok: false; reason: "unreachable"; lastRunAt: null; ageSeconds: null };
  try {
    const [beat] = await getDb().select().from(schema.systemHeartbeats).where(eq(schema.systemHeartbeats.name, "watch")).limit(1);
    body = watchHealth(beat ?? null, nowMs);
  } catch {
    body = { ok: false, reason: "unreachable", lastRunAt: null, ageSeconds: null };
  }
  let digest: DigestHealth = "not_due";
  if (new Date(nowMs).getUTCHours() >= DIGEST_HOUR_UTC + 1) {
    try {
      const rows = await getDb().select({ sentAt: schema.alerts.sentAt, payload: schema.alerts.payload }).from(schema.alerts).where(and(eq(schema.alerts.kind, "daily_digest"), eq(schema.alerts.key, digestKey(nowMs))));
      digest = digestHealth(rows, nowMs);
    } catch {
      digest = "not_yet";
    }
  }
  // Our own X account's daily step: "missed" means the switch is on and today's line did not post.
  // The day's row counts the moment it exists, so a miss in the post hour shows at once.
  let xPost: "off" | "not_due" | "ok" | "missed" | "not_run" = xPostingOn(nowMs) ? "not_due" : "off";
  const hour = pacificHour(nowMs);
  if (xPostingOn(nowMs) && hour >= X_POST_HOUR_PT) {
    try {
      const [row] = await getDb().select({ ok: schema.systemHeartbeats.lastOk, detail: schema.systemHeartbeats.detail }).from(schema.systemHeartbeats).where(eq(schema.systemHeartbeats.name, xPostDayKey(nowMs))).limit(1);
      xPost = row && row.detail !== "deciding" ? (row.ok ? "ok" : "missed") : hour >= X_POST_HOUR_PT + 1 ? "not_run" : "not_due";
    } catch {
      xPost = "not_run";
    }
  }
  // Shape only ("ok", "missing", "wrong_kind"), never a value, so a wrong paste shows before the post hour.
  const xKeys = xKeysShape(readKeys());
  return Response.json({ ...body, digest, xPost, xKeys }, { status: body.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
