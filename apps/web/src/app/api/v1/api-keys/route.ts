import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ApiKeyScope } from "@/db/schema";
import { API_KEY_PREFIX } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { track } from "@/lib/analytics/server";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";
import { dateOnlyInput } from "@/lib/expirations/tracked";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const keys = await getDb()
    .select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, createdAt: schema.apiKeys.createdAt, lastUsedAt: schema.apiKeys.lastUsedAt, revokedAt: schema.apiKeys.revokedAt, expiresAt: schema.apiKeys.expiresAt })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, actor.userId))
    .orderBy(desc(schema.apiKeys.createdAt));
  return json({ apiKeys: keys });
});

/** Create a key. Session only. The key is returned once and stored only as a hash. */
export const POST = api(async (req) => {
  const actor = await requireActor(req, "approve");
  if (actor.via !== "session") throw new ApiError(403, "session_required", "Create API keys from a signed-in session");
  const body = (await req.json().catch(() => ({}))) as { name?: string; scopes?: string[]; expiresOn?: string | null };
  const scopes = (body.scopes?.length ? body.scopes : ["read"]) as ApiKeyScope[];
  if (!scopes.every((s) => schema.apiKeyScope.enumValues.includes(s))) {
    throw new ApiError(400, "invalid_scope", "scopes must be read, write or approve");
  }
  let expiresAt: Date | null = null;
  if (body.expiresOn) {
    const expiresOn = dateOnlyInput(body.expiresOn);
    if (expiresOn <= new Date().toISOString().slice(0, 10)) throw new ApiError(400, "expires_on", "expiresOn must be after today");
    expiresAt = new Date(`${expiresOn}T00:00:00Z`);
  }
  const key = `${API_KEY_PREFIX}${randomToken(32)}`;
  await track(actor.userId, "agent_key_created", { scopes: scopes.join(",") });
  const [row] = await getDb()
    .insert(schema.apiKeys)
    .values({
      userId: actor.userId,
      name: (body.name ?? "API key").slice(0, 80),
      hashedKey: sha256Hex(key),
      prefix: key.slice(0, 7),
      scopes,
      expiresAt,
    })
    .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, expiresAt: schema.apiKeys.expiresAt });
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "api_key.created", target: `api_key:${row.id}`, after: { scopes, expiresOn: body.expiresOn ?? null } });
  return json({ apiKey: { ...row, key } }, { status: 201 });
});
