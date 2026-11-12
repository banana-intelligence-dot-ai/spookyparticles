import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { publicFinding } from "@/lib/findings";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

/** GET /api/v1/findings: every finding with its evidence, biggest dollar value first. */
export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const rows = await getDb()
    .select()
    .from(schema.findings)
    .where(eq(schema.findings.userId, actor.userId))
    .orderBy(desc(schema.findings.amountCents), desc(schema.findings.computedAt));
  return json({ findings: rows.map(publicFinding) });
});
