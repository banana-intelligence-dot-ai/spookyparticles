/**
 * DELETE /api/v1/api-keys/{id}: revoke a connected agent's key. The row stays
 * (name, when it was made, when it was last used) so the list keeps its history;
 * the key stops working at once. Session only, like creating one.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "approve");
  if (actor.via !== "session") throw new ApiError(403, "session_required", "Revoke API keys from a signed-in session");
  const { id } = await ctx.params;
  const [row] = await getDb()
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, actor.userId)))
    .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name, revokedAt: schema.apiKeys.revokedAt });
  if (!row) throw new ApiError(404, "not_found", "API key not found");
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "api_key.revoked", target: `api_key:${id}`, after: { name: row.name } });
  return json({ apiKey: row });
});
