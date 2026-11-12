import { and, eq, inArray, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Connection } from "@/db/schema";
import { missingChecksTable, missingTable } from "@/lib/checks/store";

const THIRTY_DAYS_MS = 30 * 86_400_000;

export function connectionDueForPurge(connection: Pick<Connection, "status" | "revokedAt" | "externalAccountId">, nowMs: number): boolean {
  return connection.status === "revoked" && connection.revokedAt !== null &&
    connection.revokedAt.getTime() <= nowMs - THIRTY_DAYS_MS && !connection.externalAccountId.startsWith("purged:");
}

/** Graph rows have a provider source, not a connection ID. A sole provider connection is the only safe attribution. */
export function belongsOnlyToConnection(source: string, connection: Pick<Connection, "provider" | "id">, providerConnectionIds: string[]): boolean {
  return source === connection.provider && providerConnectionIds.length === 1 && providerConnectionIds[0] === connection.id;
}

/** Call from a scheduler. No cron route is changed here. */
export async function purgeRevokedConnectionData(nowMs: number): Promise<Record<string, number>> {
  const db = getDb();
  const all = await db.select().from(schema.connections);
  const counts: Record<string, number> = { connections: 0, nodes: 0, edges: 0, findings: 0, projectChecks: 0, checkAttempts: 0, checkinJobs: 0, checkinPings: 0, modelUsage: 0, receipts: 0, messages: 0, syncRuns: 0 };
  for (const connection of all.filter((c) => connectionDueForPurge(c, nowMs))) {
    // Data from a provider has a live source only while an ACTIVE connection of that provider exists.
    // Other revoked connections do not keep it alive, or two revoked connections would shield each other forever.
    const activePeers = all.filter((c) => c.userId === connection.userId && c.provider === connection.provider && c.status === "active" && c.id !== connection.id).map((c) => c.id);
    const peers = [connection.id, ...activePeers];
    const sole = belongsOnlyToConnection(connection.provider, connection, peers);
    const userEdges = sole ? await db.select().from(schema.edges).where(eq(schema.edges.userId, connection.userId)) : [];
    const edgeIds = userEdges.filter((e) => belongsOnlyToConnection(e.provenance.source, connection, peers)).map((e) => e.id);
    if (edgeIds.length) counts.edges += (await db.delete(schema.edges).where(inArray(schema.edges.id, edgeIds)).returning({ id: schema.edges.id })).length;
    const exclusiveEdges = new Set(edgeIds);
    const nodeIds = sole ? (await db.select().from(schema.nodes).where(eq(schema.nodes.userId, connection.userId)))
      .filter((n) => n.externalKey.startsWith(`${connection.provider}:`) &&
        userEdges.every((e) => (e.fromNodeId !== n.id && e.toNodeId !== n.id) || exclusiveEdges.has(e.id)))
      .map((n) => n.id) : [];
    const nodeSet = new Set(nodeIds);
    const receiptIds = (await db.select({ id: schema.receipts.id }).from(schema.receipts).where(eq(schema.receipts.connectionId, connection.id))).map((r) => r.id);
    const receiptSet = new Set(receiptIds);
    if (nodeIds.length || receiptIds.length) {
      const findings = await db.select().from(schema.findings).where(eq(schema.findings.userId, connection.userId));
      const findingIds = findings.filter((f) =>
        (f.nodeIds.length > 0 || f.evidence.receiptIds.length > 0) &&
        f.nodeIds.every((id) => nodeSet.has(id)) && f.evidence.receiptIds.every((id) => receiptSet.has(id))).map((f) => f.id);
      if (findingIds.length) counts.findings += (await db.delete(schema.findings).where(inArray(schema.findings.id, findingIds)).returning({ id: schema.findings.id })).length;
    }
    if (nodeIds.length) {
      const ids = (await db.select({ id: schema.projectChecks.id }).from(schema.projectChecks).where(inArray(schema.projectChecks.nodeId, nodeIds)).catch((err) => { if (missingChecksTable(err)) return []; throw err; })).map((r) => r.id);
      if (ids.length) try { counts.checkAttempts += (await db.delete(schema.checkAttempts).where(inArray(schema.checkAttempts.checkId, ids)).returning({ id: schema.checkAttempts.id })).length; }
      catch (err) { if (!missingTable(err, "check_attempts")) throw err; }
      try { counts.projectChecks += (await db.delete(schema.projectChecks).where(inArray(schema.projectChecks.nodeId, nodeIds)).returning({ id: schema.projectChecks.id })).length; }
      catch (err) { if (!missingChecksTable(err)) throw err; }
      counts.nodes += (await db.delete(schema.nodes).where(inArray(schema.nodes.id, nodeIds)).returning({ id: schema.nodes.id })).length;
    }
    const jobs = await db.select({ id: schema.checkinJobs.id }).from(schema.checkinJobs)
      .where(and(eq(schema.checkinJobs.userId, connection.userId), eq(schema.checkinJobs.vercelConnectionId, connection.id)));
    const jobIds = jobs.map((j) => j.id);
    if (jobIds.length) {
      counts.checkinPings += (await db.delete(schema.checkinPings).where(inArray(schema.checkinPings.jobId, jobIds)).returning({ id: schema.checkinPings.id })).length;
      counts.checkinJobs += (await db.delete(schema.checkinJobs).where(inArray(schema.checkinJobs.id, jobIds)).returning({ id: schema.checkinJobs.id })).length;
    }
    counts.modelUsage += (await db.delete(schema.modelUsage).where(eq(schema.modelUsage.connectionId, connection.id)).returning({ id: schema.modelUsage.id })).length;
    counts.receipts += (await db.delete(schema.receipts).where(eq(schema.receipts.connectionId, connection.id)).returning({ id: schema.receipts.id })).length;
    counts.messages += (await db.delete(schema.messages).where(eq(schema.messages.connectionId, connection.id)).returning({ id: schema.messages.id })).length;
    counts.syncRuns += (await db.delete(schema.syncRuns).where(eq(schema.syncRuns.connectionId, connection.id)).returning({ id: schema.syncRuns.id })).length;
    // There is no purged column. Empty identifying fields and use a sentinel in the required unique key.
    const changed = await db.update(schema.connections).set({ externalAccountId: `purged:${connection.id}`, display: "", scopes: [], statusReason: null,
      encryptedAccessToken: null, encryptedRefreshToken: null, tokenExpiresAt: null, keyId: null, lastSyncedAt: null })
      .where(and(eq(schema.connections.id, connection.id), eq(schema.connections.status, "revoked"))).returning({ id: schema.connections.id });
    counts.connections += changed.length;
  }
  return counts;
}

/**
 * Execute account deletions whose grace period has passed. The delete route already revoked every
 * connection (tokens wiped, providers told) when the request was made; this removes every row the
 * account owns, in one atomic batch, then marks the request completed. The request row is kept as
 * proof of the request, as the privacy policy says. Audit rows are then stripped of identifiers by
 * stripDeletedAccountAudit, the one change the append-only trigger allows (migration 0018).
 */
export async function executeDueDeletions(nowMs: number): Promise<{ accounts: number; rows: number }> {
  const db = getDb();
  const due = await db.select().from(schema.deletionRequests)
    .where(and(eq(schema.deletionRequests.status, "scheduled"), lte(schema.deletionRequests.scheduledFor, new Date(nowMs))));
  let accounts = 0;
  let rows = 0;
  for (const request of due) {
    const userId = request.userId;
    const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId));
    const jobs = db.select({ id: schema.checkinJobs.id }).from(schema.checkinJobs).where(eq(schema.checkinJobs.userId, userId));
    const connections = db.select({ id: schema.connections.id }).from(schema.connections).where(eq(schema.connections.userId, userId));
    try { rows += (await db.delete(schema.checkAttempts).where(eq(schema.checkAttempts.userId, userId)).returning({ id: schema.checkAttempts.id })).length; }
    catch (err) { if (!missingTable(err, "check_attempts")) throw err; }
    try { rows += (await db.delete(schema.projectChecks).where(eq(schema.projectChecks.userId, userId)).returning({ id: schema.projectChecks.id })).length; }
    catch (err) { if (!missingChecksTable(err)) throw err; }
    const results = await db.batch([
      db.delete(schema.checkinPings).where(inArray(schema.checkinPings.jobId, jobs)).returning({ id: schema.checkinPings.id }),
      db.delete(schema.checkinJobs).where(eq(schema.checkinJobs.userId, userId)).returning({ id: schema.checkinJobs.id }),
      db.delete(schema.alertChannels).where(eq(schema.alertChannels.userId, userId)).returning({ id: schema.alertChannels.id }),
      db.delete(schema.alerts).where(eq(schema.alerts.userId, userId)).returning({ id: schema.alerts.id }),
      db.delete(schema.alertSettings).where(eq(schema.alertSettings.userId, userId)).returning({ userId: schema.alertSettings.userId }),
      db.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, userId)).returning({ id: schema.apiKeys.id }),
      db.delete(schema.usageEvents).where(eq(schema.usageEvents.userId, userId)).returning({ id: schema.usageEvents.id }),
      db.delete(schema.events).where(eq(schema.events.userId, userId)).returning({ id: schema.events.id }),
      db.delete(schema.userRefs).where(eq(schema.userRefs.userId, userId)).returning({ userId: schema.userRefs.userId }),
      db.delete(schema.modelUsage).where(eq(schema.modelUsage.userId, userId)).returning({ id: schema.modelUsage.id }),
      db.delete(schema.findings).where(eq(schema.findings.userId, userId)).returning({ id: schema.findings.id }),
      db.delete(schema.edges).where(eq(schema.edges.userId, userId)).returning({ id: schema.edges.id }),
      db.delete(schema.nodes).where(eq(schema.nodes.userId, userId)).returning({ id: schema.nodes.id }),
      db.delete(schema.receipts).where(eq(schema.receipts.userId, userId)).returning({ id: schema.receipts.id }),
      db.delete(schema.messages).where(inArray(schema.messages.connectionId, connections)).returning({ id: schema.messages.id }),
      db.delete(schema.syncRuns).where(inArray(schema.syncRuns.connectionId, connections)).returning({ id: schema.syncRuns.id }),
      db.delete(schema.connections).where(eq(schema.connections.userId, userId)).returning({ id: schema.connections.id }),
      db.delete(schema.verification).where(eq(schema.verification.identifier, person?.email ?? "")).returning({ id: schema.verification.id }),
      db.delete(schema.session).where(eq(schema.session.userId, userId)).returning({ id: schema.session.id }),
      db.delete(schema.account).where(eq(schema.account.userId, userId)).returning({ id: schema.account.id }),
      db.delete(schema.user).where(eq(schema.user.id, userId)).returning({ id: schema.user.id }),
      db.update(schema.deletionRequests).set({ status: "completed", completedAt: new Date(nowMs) }).where(eq(schema.deletionRequests.id, request.id)).returning({ id: schema.deletionRequests.id }),
    ]);
    accounts += 1;
    rows += results.slice(0, -1).reduce((n, r) => n + r.length, 0);
  }
  await stripDeletedAccountAudit();
  return { accounts, rows };
}

/** The only update the audit trigger allows: identifiers emptied, action and time kept. */
export const STRIPPED_AUDIT = { actor: "deleted", userId: null, target: "", before: null, after: null } as const;

/**
 * Strips every audit row of a completed deletion that still names the person: by user_id, or by
 * an actor of "user:<id>". Runs after each deletion sweep, so rows missed before migration 0018
 * was applied are caught on a later run. A database without 0018 refuses the update; that is
 * logged and the deletion itself still stands.
 */
export async function stripDeletedAccountAudit(): Promise<number> {
  const db = getDb();
  const done = await db.select({ userId: schema.deletionRequests.userId }).from(schema.deletionRequests)
    .where(eq(schema.deletionRequests.status, "completed"));
  const ids = [...new Set(done.map((d) => d.userId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return 0;
  try {
    const stripped = await db.update(schema.auditLog).set(STRIPPED_AUDIT)
      .where(or(inArray(schema.auditLog.userId, ids), inArray(schema.auditLog.actor, ids.map((id) => `user:${id}`))))
      .returning({ id: schema.auditLog.id });
    return stripped.length;
  } catch (err) {
    if (!/append-only/.test((err as Error).message)) throw err;
    console.error("[purge] audit rows not stripped: migration 0018 is not applied yet");
    return 0;
  }
}
