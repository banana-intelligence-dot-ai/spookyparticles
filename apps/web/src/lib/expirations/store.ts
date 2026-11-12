import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mergeExpirations } from "./expirations";

export async function expirationsFor(userId: string, now = new Date()) {
  const db = getDb();
  const [nodes, tracked, keys] = await Promise.all([
    db.select({ kind: schema.nodes.kind, name: schema.nodes.name, attributes: schema.nodes.attributes }).from(schema.nodes).where(eq(schema.nodes.userId, userId)),
    db.select({ id: schema.trackedExpirations.id, kind: schema.trackedExpirations.kind, name: schema.trackedExpirations.name, provider: schema.trackedExpirations.provider, hint: schema.trackedExpirations.hint, project: schema.trackedExpirations.project, expiresOn: schema.trackedExpirations.expiresOn }).from(schema.trackedExpirations).where(eq(schema.trackedExpirations.userId, userId)),
    db.select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, expiresAt: schema.apiKeys.expiresAt }).from(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt), isNotNull(schema.apiKeys.expiresAt))),
  ]);
  return {
    items: mergeExpirations(nodes, tracked, keys.flatMap((key) => key.expiresAt ? [{ ...key, expiresAt: key.expiresAt }] : []), now),
    unknownDomains: nodes.filter((n) => n.kind === "domain" && n.attributes.provider === "vercel" && typeof n.attributes.expires_at !== "string")
      .map((n) => ({ name: n.name, reason: n.attributes.registration === "elsewhere" ? "registered elsewhere, date unknown" : "date unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
