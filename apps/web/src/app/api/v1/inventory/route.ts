import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Kind = (typeof schema.nodeKind.enumValues)[number];

/** Nodes grouped by kind. Optional ?kind= filter. */
export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind && !schema.nodeKind.enumValues.includes(kind as Kind)) {
    throw new ApiError(400, "invalid_kind", `kind must be one of ${schema.nodeKind.enumValues.join(", ")}`);
  }
  const rows = await getDb()
    .select()
    .from(schema.nodes)
    .where(
      kind
        ? and(eq(schema.nodes.userId, actor.userId), eq(schema.nodes.kind, kind as Kind))
        : eq(schema.nodes.userId, actor.userId),
    )
    .orderBy(asc(schema.nodes.kind), asc(schema.nodes.name));
  const byKind: Record<string, unknown[]> = {};
  for (const n of rows) {
    const { userId: _userId, ...rest } = n;
    (byKind[n.kind] ??= []).push(rest);
  }
  return json({ total: rows.length, byKind });
});
