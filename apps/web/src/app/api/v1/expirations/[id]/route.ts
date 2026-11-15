import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { expirationId } from "@/lib/expirations/tracked";
import { updateTrackedExpiration } from "@/lib/expirations/update";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const row = await updateTrackedExpiration(actor, (await ctx.params).id, body);
  return json({ expiration: row });
});

export const DELETE = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const id = expirationId((await ctx.params).id);
  const [row] = await getDb().delete(schema.trackedExpirations).where(and(eq(schema.trackedExpirations.id, id), eq(schema.trackedExpirations.userId, actor.userId))).returning({
    id: schema.trackedExpirations.id,
    kind: schema.trackedExpirations.kind,
    name: schema.trackedExpirations.name,
    provider: schema.trackedExpirations.provider,
    project: schema.trackedExpirations.project,
    expiresOn: schema.trackedExpirations.expiresOn,
  });
  if (!row) throw new ApiError(404, "not_found", "Expiration not found");
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "expiration.removed", target: `expiration:${id}`, before: row });
  return json({ removed: { id } });
});
