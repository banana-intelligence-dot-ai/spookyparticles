import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { expirationAuditFields, trackedExpirationInput } from "./tracked";

/** Adds one tracked expiry (a name and a date, never a secret). Shared by POST /api/v1/expirations and the MCP add_expiration tool. */
export async function addTrackedExpiration(actor: Actor, body: unknown) {
  const input = trackedExpirationInput(body);
  const [row] = await getDb().insert(schema.trackedExpirations).values({ userId: actor.userId, ...input }).returning({
    id: schema.trackedExpirations.id,
    kind: schema.trackedExpirations.kind,
    name: schema.trackedExpirations.name,
    provider: schema.trackedExpirations.provider,
    hint: schema.trackedExpirations.hint,
    project: schema.trackedExpirations.project,
    expiresOn: schema.trackedExpirations.expiresOn,
  });
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "expiration.added", target: `expiration:${row.id}`, after: expirationAuditFields(input) });
  return row;
}
