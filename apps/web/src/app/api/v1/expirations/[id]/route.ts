import { removeTrackedExpiration } from "@/lib/expirations/remove";
import { updateTrackedExpiration } from "@/lib/expirations/update";
import { api, json } from "@/lib/http";
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
  return json(await removeTrackedExpiration(actor, (await ctx.params).id));
});
