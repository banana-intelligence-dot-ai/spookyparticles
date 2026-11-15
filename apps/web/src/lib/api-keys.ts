import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ApiKeyScope } from "@/db/schema";
import { API_KEY_PREFIX, type Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { track } from "@/lib/analytics/server";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { dateOnlyInput } from "@/lib/expirations/tracked";
import { ApiError } from "@/lib/http";

export async function listApiKeys(actor: Actor) {
  return getDb().select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, createdAt: schema.apiKeys.createdAt, lastUsedAt: schema.apiKeys.lastUsedAt, revokedAt: schema.apiKeys.revokedAt, expiresAt: schema.apiKeys.expiresAt })
    .from(schema.apiKeys).where(eq(schema.apiKeys.userId, actor.userId)).orderBy(desc(schema.apiKeys.createdAt));
}

export async function createApiKey(actor: Actor, body: { name?: string; scopes?: string[]; expiresOn?: string | null }) {
  if (body.name !== undefined && typeof body.name !== "string") throw new ApiError(400, "name", "name: up to 80 characters");
  if (body.scopes !== undefined && !Array.isArray(body.scopes)) throw new ApiError(400, "invalid_scope", "scopes must be read, write or approve");
  const scopes = (body.scopes?.length ? body.scopes : ["read"]) as ApiKeyScope[];
  if (!scopes.every((s) => schema.apiKeyScope.enumValues.includes(s))) throw new ApiError(400, "invalid_scope", "scopes must be read, write or approve");
  if (actor.via === "api_key" && scopes.some((s) => !actor.scopes.includes(s))) {
    throw new ApiError(403, "scope_exceeds_caller", "A key can only make keys with the access it has itself");
  }
  let expiresAt: Date | null = null;
  if (body.expiresOn) {
    const expiresOn = dateOnlyInput(body.expiresOn);
    if (expiresOn <= new Date().toISOString().slice(0, 10)) throw new ApiError(400, "expires_on", "expiresOn must be after today");
    expiresAt = new Date(`${expiresOn}T00:00:00Z`);
  }
  // A key made by a key never outlives it, so an expiring key cannot make itself permanent.
  if (actor.via === "api_key" && actor.apiKeyId) {
    const [parent] = await getDb().select({ expiresAt: schema.apiKeys.expiresAt }).from(schema.apiKeys).where(and(eq(schema.apiKeys.id, actor.apiKeyId), eq(schema.apiKeys.userId, actor.userId))).limit(1);
    if (parent?.expiresAt && (!expiresAt || expiresAt > parent.expiresAt)) expiresAt = parent.expiresAt;
  }
  const key = `${API_KEY_PREFIX}${randomToken(32)}`;
  await track(actor.userId, "agent_key_created", { scopes: scopes.join(",") });
  const [row] = await getDb().insert(schema.apiKeys).values({ userId: actor.userId, name: (body.name ?? "API key").slice(0, 80), hashedKey: sha256Hex(key), prefix: key.slice(0, 7), scopes, expiresAt })
    .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, expiresAt: schema.apiKeys.expiresAt });
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "api_key.created", target: `api_key:${row.id}`, after: { scopes, expiresOn: expiresAt ? expiresAt.toISOString().slice(0, 10) : null } });
  return { ...row, key };
}

export async function revokeApiKey(actor: Actor, id: string) {
  const [row] = await getDb().update(schema.apiKeys).set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, actor.userId)))
    .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name, revokedAt: schema.apiKeys.revokedAt });
  if (!row) throw new ApiError(404, "not_found", "API key not found");
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "api_key.revoked", target: `api_key:${id}`, after: { name: row.name } });
  return row;
}
