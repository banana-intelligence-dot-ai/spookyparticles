import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "./actor";
import { appendAudit } from "./audit";
import { publicFinding } from "./findings";
import { ApiError } from "./http";

const STATUSES = new Set(["open", "confirmed", "dismissed"]);
export type FindingStatus = "open" | "confirmed" | "dismissed";

/** The user's verdict on a finding. Shared by POST /api/v1/findings/{id} and the MCP set_suggestion_status tool. */
export async function setFindingStatus(actor: Actor, id: string, status: unknown) {
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
    .set({ status: status as FindingStatus, updatedAt: new Date() })
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
  return { finding: publicFinding(after) };
}
