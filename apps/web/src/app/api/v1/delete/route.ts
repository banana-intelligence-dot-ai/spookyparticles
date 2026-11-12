import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { revokeConnection } from "@/lib/connections";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

const GRACE_DAYS = 7;

/**
 * Schedule full deletion. Revokes every active connection now (tokens are wiped
 * immediately), then records a deletion request for the purge job.
 * Session only: an API key cannot delete an account.
 */
export const POST = api(async (req) => {
  const actor = await requireActor(req, "approve");
  if (actor.via !== "session") throw new ApiError(403, "session_required", "Delete the account from a signed-in session");
  const db = getDb();
  const active = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.userId, actor.userId), eq(schema.connections.status, "active")));
  const revoked = [];
  for (const c of active) revoked.push(await revokeConnection(c, actor.label));

  const scheduledFor = new Date(Date.now() + GRACE_DAYS * 86_400_000);
  const [request] = await db
    .insert(schema.deletionRequests)
    .values({ userId: actor.userId, scheduledFor })
    .returning();
  // The purge (lib/purge.ts, run from the sweep) executes this request on scheduled_for and
  // deletes every row the account owns. A cancel endpoint for the grace period is still to do.
  await appendAudit({
    actor: actor.label,
    userId: actor.userId,
    action: "account.deletion_scheduled",
    target: `user:${actor.userId}`,
    after: { requestId: request.id, scheduledFor: scheduledFor.toISOString(), connectionsRevoked: revoked.length },
  });
  return json({ deletion: { id: request.id, status: request.status, scheduledFor }, revoked }, { status: 202 });
});
