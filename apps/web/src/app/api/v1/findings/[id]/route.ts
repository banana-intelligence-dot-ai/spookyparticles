/**
 * POST /api/v1/findings/{id} with { status: "confirmed" | "dismissed" | "open" }.
 * The user's verdict on a finding; "dismissed" is the "wrong?" button. The
 * verdict survives recomputes. Every change is audited.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { publicFinding } from "@/lib/findings";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };
const STATUSES = new Set(["open", "confirmed", "dismissed"]);

export const POST = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status;
  if (typeof status !== "string" || !STATUSES.has(status)) {
    throw new ApiError(400, "bad_request", 'status must be "open", "confirmed" or "dismissed"');
  }
  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.findings)
    .where(and(eq(schema.findings.id, id), eq(schema.findings.userId, actor.userId)))
    .limit(1);
  if (!before) throw new ApiError(404, "not_found", "Finding not found");
  const [after] = await db
    .update(schema.findings)
    .set({ status: status as "open" | "confirmed" | "dismissed", updatedAt: new Date() })
    .where(eq(schema.findings.id, id))
    .returning();
  await appendAudit({
    actor: actor.label,
    userId: actor.userId,
    action: "finding.status",
    target: `finding:${id}`,
    before: { status: before.status },
    after: { status: after.status, kind: after.kind, key: after.key },
  });
  return json({ finding: publicFinding(after) });
});
