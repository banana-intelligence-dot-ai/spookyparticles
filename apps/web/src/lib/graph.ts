/**
 * Graph writes. Every edge carries provenance. Attributes are checked so token
 * values and env var values cannot enter the graph by accident.
 */
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Provenance } from "@/db/schema";

type NodeKind = (typeof schema.nodeKind.enumValues)[number];
type EdgeKind = (typeof schema.edgeKind.enumValues)[number];

const FORBIDDEN_KEY = /(^|_)(token|secret|password|private_?key|value)$/i;

/** Throws if an attribute key looks like it holds a secret value. Names are fine; values are not. */
export function assertNoSecretValues(attributes: Record<string, unknown>, path = ""): void {
  for (const [k, v] of Object.entries(attributes)) {
    if (FORBIDDEN_KEY.test(k)) throw new Error(`attribute "${path}${k}" may hold a secret value`);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      assertNoSecretValues(v as Record<string, unknown>, `${path}${k}.`);
    }
  }
}

export async function upsertNode(input: {
  userId: string;
  kind: NodeKind;
  externalKey: string;
  name: string;
  attributes?: Record<string, unknown>;
  status?: string | null;
  lastActivityAt?: Date | null;
}): Promise<string> {
  const attributes = input.attributes ?? {};
  assertNoSecretValues(attributes);
  const values = {
    userId: input.userId,
    kind: input.kind,
    externalKey: input.externalKey,
    name: input.name,
    attributes,
    status: input.status ?? null,
    lastActivityAt: input.lastActivityAt ?? null,
  };
  const [row] = await getDb()
    .insert(schema.nodes)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.nodes.userId, schema.nodes.kind, schema.nodes.externalKey],
      set: { ...values, lastSeenAt: sql`now()` },
    })
    .returning({ id: schema.nodes.id });
  return row.id;
}

export async function upsertEdge(input: {
  userId: string;
  fromNodeId: string;
  toNodeId: string;
  kind: EdgeKind;
  confidence: number;
  provenance: Provenance;
}): Promise<void> {
  await getDb()
    .insert(schema.edges)
    .values(input)
    .onConflictDoUpdate({
      target: [schema.edges.fromNodeId, schema.edges.toNodeId, schema.edges.kind],
      set: { confidence: input.confidence, provenance: input.provenance, lastSeenAt: sql`now()` },
    });
}
