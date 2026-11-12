import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { publicConnection } from "@/lib/connections";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";
import { readChecks } from "@/lib/checks/store";
import { readAttempts } from "@/lib/checks/handoff-store";

/** Everything we hold about the caller, as JSON. Token ciphertext is never included. */
export const POST = api(async (req) => {
  const actor = await requireActor(req, "read");
  const db = getDb();
  const uid = actor.userId;
  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, uid));
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.userId, uid));
  const connIds = conns.map((c) => c.id);
  const [nodes, edges, findings, audit, keys, projectChecks, checkAttempts] = await Promise.all([
    db.select().from(schema.nodes).where(eq(schema.nodes.userId, uid)),
    db.select().from(schema.edges).where(eq(schema.edges.userId, uid)),
    db.select().from(schema.findings).where(eq(schema.findings.userId, uid)),
    db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, uid)),
    db
      .select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, createdAt: schema.apiKeys.createdAt, lastUsedAt: schema.apiKeys.lastUsedAt, revokedAt: schema.apiKeys.revokedAt })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, uid)),
    readChecks(uid),
    readAttempts(uid),
  ]);
  const [messages, syncRuns] = connIds.length
    ? await Promise.all([
        db.select().from(schema.messages).where(inArray(schema.messages.connectionId, connIds)),
        db.select().from(schema.syncRuns).where(inArray(schema.syncRuns.connectionId, connIds)),
      ])
    : [[], []];

  await appendAudit({ actor: actor.label, userId: uid, action: "account.exported", target: `user:${uid}` });
  return json(
    {
      exportedAt: new Date().toISOString(),
      user,
      connections: conns.map(publicConnection),
      apiKeys: keys,
      nodes,
      edges,
      findings,
      projectChecks: projectChecks.rows,
      checkAttempts,
      messages,
      syncRuns,
      auditLog: audit,
    },
    { headers: { "content-disposition": `attachment; filename="spooky-particles-export.json"` } },
  );
});
