import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { expirationsFor } from "@/lib/expirations/store";
import { expirationAuditFields, trackedExpirationInput } from "@/lib/expirations/tracked";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await expirationsFor(actor.userId));
});

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  const input = trackedExpirationInput(await req.json().catch(() => ({})));
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
  return json({ expiration: row }, { status: 201 });
});
