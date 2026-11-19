import { and, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Connection } from "@/db/schema";
import { getAccessToken } from "@/lib/connections";
import { teamQuery, vercelGet, type VercelScope } from "@/lib/providers/vercel";

export const VERCEL_FULL_SYNC_MS = 60 * 60_000;
export const VERCEL_FINGERPRINT_KEY = "vercel_deploy_fingerprint";

/**
 * The account node's attributes with the fingerprint merged in. Both values are cast to text:
 * Postgres cannot type a bare parameter inside jsonb_build_object, and without the casts every
 * sync failed at its last write (found live 2026-11-19).
 */
export function withFingerprint(fingerprint: string): SQL {
  return sql`${schema.nodes.attributes} || jsonb_build_object(${VERCEL_FINGERPRINT_KEY}::text, ${fingerprint}::text)`;
}

type ScopeNode = { nodeId: string; scope: VercelScope; fingerprint: string | null };

/** Only deployment identity and status can affect the gate; no response metadata is stored. */
export function deploymentFingerprint(raw: unknown): string {
  if (!Array.isArray(raw)) throw new Error("Vercel deployment list is invalid");
  return JSON.stringify(raw.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Vercel deployment is invalid");
    const d = item as Record<string, unknown>;
    const id = d.id ?? d.uid;
    if (typeof id !== "string" || !id) throw new Error("Vercel deployment id is missing");
    const fields = [d.state ?? null, d.readyState ?? null, d.target ?? null];
    if (fields.some((field) => field !== null && typeof field !== "string")) throw new Error("Vercel deployment status is invalid");
    return [id, ...fields];
  }));
}

/** A watch may skip only when every scope matches a recent successful full read. */
export function shouldSkipVercelSync(input: {
  actor: string; saved: string | null; current: string | null; lastSyncedAt: Date | null;
  nowMs: number; lastRunSucceeded: boolean; gateError?: boolean; hourlyDue?: boolean;
}): boolean {
  return input.actor === "system:watch" && input.lastRunSucceeded && !input.gateError && !input.hourlyDue &&
    input.saved !== null && input.current !== null && input.saved === input.current &&
    input.lastSyncedAt !== null && input.nowMs >= input.lastSyncedAt.getTime() &&
    input.nowMs - input.lastSyncedAt.getTime() < VERCEL_FULL_SYNC_MS;
}

/** The account nodes are the scopes recorded by the last inventory. */
export async function storedVercelScopes(c: Connection): Promise<ScopeNode[]> {
  const nodes = await getDb().select({ id: schema.nodes.id, externalKey: schema.nodes.externalKey, attributes: schema.nodes.attributes })
    .from(schema.nodes).where(and(eq(schema.nodes.userId, c.userId), eq(schema.nodes.kind, "provider_account")));
  return nodes.flatMap((node): ScopeNode[] => {
    const a = node.attributes;
    if (a.provider !== "vercel" || a.connection_id !== c.id || !node.externalKey.startsWith("vercel:account:")) return [];
    const kind = a.scope_kind;
    if (kind !== "user" && kind !== "team") return [];
    const id = node.externalKey === `vercel:account:connection-${c.id}` ? "scoped" : node.externalKey.slice("vercel:account:".length);
    if (!id) return [];
    const slug = typeof a.slug === "string" ? a.slug : id;
    return [{ nodeId: node.id, scope: { kind, id, slug, name: slug }, fingerprint: typeof a[VERCEL_FINGERPRINT_KEY] === "string" ? a[VERCEL_FINGERPRINT_KEY] : null }];
  });
}

/** One read-only GET per known scope, using the provider's normal GET helper. */
export async function vercelScopeFingerprints(token: string, scopes: { scope: VercelScope }[]): Promise<string[]> {
  return Promise.all(scopes.map(async ({ scope }) => {
    const body = await vercelGet<{ deployments?: unknown }>(token, "/v7/deployments", { ...teamQuery(scope), limit: 10 });
    return deploymentFingerprint(body.deployments);
  }));
}

export async function currentVercelFingerprints(connectionId: string, scopes: { scope: VercelScope }[]): Promise<string[]> {
  return vercelScopeFingerprints(await getAccessToken(connectionId), scopes);
}
