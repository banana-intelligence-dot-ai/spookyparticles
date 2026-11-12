import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

/**
 * The result card payload: totals only. Counts and monthly dollar totals by
 * finding kind. Unknown amounts are counted but never summed as zero-cost guesses;
 * `unknownAmount` says how many findings have no dollar value yet.
 */
export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const rows = await getDb()
    .select({
      kind: schema.findings.kind,
      currency: schema.findings.currency,
      count: sql<number>`count(*)::int`,
      amountCents: sql<number>`coalesce(sum(${schema.findings.amountCents}), 0)::int`,
      unknownAmount: sql<number>`count(*) filter (where ${schema.findings.amountCents} is null)::int`,
    })
    .from(schema.findings)
    .where(eq(schema.findings.userId, actor.userId))
    .groupBy(schema.findings.kind, schema.findings.currency);

  const byKind = schema.findingKind.enumValues.map((kind) => {
    const r = rows.filter((x) => x.kind === kind);
    return {
      kind,
      count: r.reduce((a, x) => a + x.count, 0),
      amountCents: r.filter((x) => x.currency === "USD").reduce((a, x) => a + x.amountCents, 0),
      unknownAmount: r.reduce((a, x) => a + x.unknownAmount, 0),
    };
  });
  return json({
    currency: "USD",
    period: "month",
    total: {
      count: byKind.reduce((a, x) => a + x.count, 0),
      amountCents: byKind.reduce((a, x) => a + x.amountCents, 0),
    },
    byKind,
  });
});
