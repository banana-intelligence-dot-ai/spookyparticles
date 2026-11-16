/**
 * Lean node reads for the watcher. A node's attributes hold everything the last sync saw, and the
 * watcher reads every project and domain every few minutes, so whole rows cost real database
 * transfer. These reads bring back the plain columns and only the attribute keys a pass uses.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type SlimNode = Pick<typeof schema.nodes.$inferSelect, "id" | "userId" | "kind" | "externalKey" | "name" | "status" | "attributes">;

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A jsonb object of just these attribute keys. A missing key comes back as null and is dropped by dropNulls. */
export function pickAttributes(keys: readonly string[]) {
  if (!keys.length || keys.some((k) => !KEY.test(k))) throw new Error("pickAttributes: bad key list");
  const pairs = keys.map((k) => sql`${k}::text, ${schema.nodes.attributes} -> ${k}::text`);
  return sql<Record<string, unknown>>`jsonb_build_object(${sql.join(pairs, sql`, `)})`;
}

/** Top-level nulls only, so a missing key reads as absent. Values inside are kept exactly. */
export function dropNulls(attributes: Record<string, unknown> | null): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attributes ?? {}).filter(([, v]) => v !== null));
}

export async function readNodes(kind: SlimNode["kind"], keys: readonly string[]): Promise<SlimNode[]> {
  const n = schema.nodes;
  const rows = await getDb()
    .select({ id: n.id, userId: n.userId, kind: n.kind, externalKey: n.externalKey, name: n.name, status: n.status, attributes: pickAttributes(keys) })
    .from(n)
    .where(eq(n.kind, kind));
  return rows.map((r) => ({ ...r, attributes: dropNulls(r.attributes) }));
}
