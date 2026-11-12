import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { expirationAuditFields, expirationId, trackedExpirationInput } from "@/lib/expirations/tracked";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const id = expirationId((await ctx.params).id);
  const db = getDb();
  const [old] = await db.select().from(schema.trackedExpirations).where(and(eq(schema.trackedExpirations.id, id), eq(schema.trackedExpirations.userId, actor.userId))).limit(1);
  if (!old) throw new ApiError(404, "not_found", "Expiration not found");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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
