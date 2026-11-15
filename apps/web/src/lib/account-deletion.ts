import { and, desc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { revokeConnection } from "@/lib/connections";
import { ApiError } from "@/lib/http";

const GRACE_DAYS = 7;
const CANCEL_CUTOFF_MS = 10 * 60_000;
const NOTE = "Connections revoked when deletion was scheduled stay revoked; connect them again in Settings.";

export async function deletionStatus(actor: Actor) {
  const [row] = await getDb().select({ id: schema.deletionRequests.id, status: schema.deletionRequests.status, scheduledFor: schema.deletionRequests.scheduledFor })
    .from(schema.deletionRequests).where(and(eq(schema.deletionRequests.userId, actor.userId), eq(schema.deletionRequests.status, "scheduled")))
    .orderBy(desc(schema.deletionRequests.requestedAt)).limit(1);
  return { deletion: row ?? null };
}

export async function scheduleDeletion(actor: Actor, body: { confirmEmail?: unknown }) {
  const db = getDb();
  if (actor.via === "api_key") {
    const [user] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, actor.userId)).limit(1);
    if (!user) throw new ApiError(404, "not_found", "User not found");
    if (typeof body?.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      throw new ApiError(400, "confirm_email", "Send confirmEmail: the account's email address");
    }
  }
  const current = await deletionStatus(actor);
  if (current.deletion) return { deletion: current.deletion, revoked: [] };
  const active = await db.select().from(schema.connections).where(and(eq(schema.connections.userId, actor.userId), eq(schema.connections.status, "active")));
  const revoked = [];
  for (const c of active) revoked.push(await revokeConnection(c, actor.label));
  const scheduledFor = new Date(Date.now() + GRACE_DAYS * 86_400_000);
  const [request] = await db.insert(schema.deletionRequests).values({ userId: actor.userId, scheduledFor }).returning();
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "account.deletion_scheduled", target: `user:${actor.userId}`, after: { requestId: request.id, scheduledFor: scheduledFor.toISOString(), connectionsRevoked: revoked.length } });
  return { deletion: { id: request.id, status: request.status, scheduledFor }, revoked };
}

export async function cancelDeletion(actor: Actor) {
  // The purge takes requests whose time has come. Cancel stops a few minutes short of that, so the two can never work on the same request.
  const rows = await getDb().update(schema.deletionRequests).set({ status: "cancelled" })
    .where(and(eq(schema.deletionRequests.userId, actor.userId), eq(schema.deletionRequests.status, "scheduled"), gt(schema.deletionRequests.scheduledFor, new Date(Date.now() + CANCEL_CUTOFF_MS)))).returning({ id: schema.deletionRequests.id });
  if (!rows.length) {
    if ((await deletionStatus(actor)).deletion) throw new ApiError(409, "too_late", "Deletion is already running and cannot be cancelled.");
    throw new ApiError(404, "not_scheduled", "No scheduled deletion");
  }
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "account.deletion_cancelled", target: `user:${actor.userId}`, after: { requestIds: rows.map((r) => r.id) } });
  return { cancelled: true, note: NOTE };
}
