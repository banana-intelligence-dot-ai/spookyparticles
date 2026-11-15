import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { expirationAuditFields, expirationId, trackedExpirationInput } from "@/lib/expirations/tracked";
import { ApiError } from "@/lib/http";

/** Shared PATCH validation and audited update for REST and MCP. */
export async function updateTrackedExpiration(actor: Actor, rawId: string, body: Record<string, unknown>) {
  const id = expirationId(rawId);
  const db = getDb();
  const [old] = await db.select().from(schema.trackedExpirations).where(and(eq(schema.trackedExpirations.id, id), eq(schema.trackedExpirations.userId, actor.userId))).limit(1);
  if (!old) throw new ApiError(404, "not_found", "Expiration not found");
  const input = trackedExpirationInput({
    kind: body.kind ?? old.kind,
    name: body.name ?? old.name,
    provider: body.provider === undefined ? old.provider : body.provider,
    hint: body.hint === undefined ? old.hint : body.hint,
    project: body.project === undefined ? old.project : body.project,
    expiresOn: body.expiresOn ?? old.expiresOn,
  });
  const [row] = await db.update(schema.trackedExpirations).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.trackedExpirations.id, id), eq(schema.trackedExpirations.userId, actor.userId))).returning();
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "expiration.changed", target: `expiration:${id}`, before: expirationAuditFields({ kind: old.kind, name: old.name, provider: old.provider, hint: old.hint, project: old.project, expiresOn: old.expiresOn }), after: expirationAuditFields(input) });
  return row;
}
