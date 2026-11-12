import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "./audit";
import { track } from "./analytics/server";
import { moveDecision, type ProductionDeployment } from "./move-home";

/** Persist the first observed move once. Conditional update makes concurrent reads safe. */
export async function recordProductionMove(input: { userId: string; nodeId: string; attributes: Record<string, unknown>; deployments: ProductionDeployment[] }) {
  const decision = moveDecision(input.attributes.productionHost, input.attributes.movedToVercelAt, input.deployments);
  if (!decision) return;
  const db = getDb();
  if (decision.kind === "remember") {
    await db.update(schema.nodes).set({ attributes: sql`${schema.nodes.attributes} || ${JSON.stringify({ productionHost: decision.host })}::jsonb` })
      .where(and(eq(schema.nodes.id, input.nodeId), eq(schema.nodes.userId, input.userId), sql`${schema.nodes.attributes}->>'movedToVercelAt' is null`, sql`${schema.nodes.attributes}->>'productionHost' is distinct from ${decision.host}`));
    return;
  }
  const [updated] = await db.update(schema.nodes).set({ attributes: sql`${schema.nodes.attributes} || ${JSON.stringify({ productionHost: decision.host, movedToVercelAt: decision.at, movedFrom: decision.host })}::jsonb` })
    .where(and(eq(schema.nodes.id, input.nodeId), eq(schema.nodes.userId, input.userId), sql`${schema.nodes.attributes}->>'movedToVercelAt' is null`, sql`(${schema.nodes.attributes}->>'productionHost' is null or ${schema.nodes.attributes}->>'productionHost' = ${decision.host})`))
    .returning({ id: schema.nodes.id });
  if (!updated) return;
  await appendAudit({ actor: "system:project-host", userId: input.userId, action: "project.moved_to_vercel", target: `node:${input.nodeId}`, after: { from: decision.host, at: decision.at } });
  await track(`user:${input.userId}`, "moved_to_vercel", { from: decision.host });
  return { from: decision.host, at: decision.at };
}
