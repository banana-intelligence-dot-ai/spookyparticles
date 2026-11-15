import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { ApiError } from "@/lib/http";
import { expirationId } from "./tracked";

export async function removeTrackedExpiration(actor: Actor, rawId: string) {
  const id = expirationId(rawId);
  const [row] = await getDb().delete(schema.trackedExpirations).where(and(eq(schema.trackedExpirations.id, id), eq(schema.trackedExpirations.userId, actor.userId))).returning({
    id: schema.trackedExpirations.id, kind: schema.trackedExpirations.kind, name: schema.trackedExpirations.name,
    provider: schema.trackedExpirations.provider, project: schema.trackedExpirations.project, expiresOn: schema.trackedExpirations.expiresOn,
  });
  if (!row) throw new ApiError(404, "not_found", "Expiration not found");
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "expiration.removed", target: `expiration:${id}`, before: row });
  return { removed: { id } };
}
