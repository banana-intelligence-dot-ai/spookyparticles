import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const db = getDb();
  const [nodes, edges] = await Promise.all([
    db.select().from(schema.nodes).where(eq(schema.nodes.userId, actor.userId)),
    db.select().from(schema.edges).where(eq(schema.edges.userId, actor.userId)),
  ]);
  return json({
    nodes: nodes.map(({ userId: _u, ...n }) => n),
    edges: edges.map(({ userId: _u, ...e }) => e),
  });
});
