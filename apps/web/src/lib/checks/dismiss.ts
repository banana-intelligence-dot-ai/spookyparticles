import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { ApiError } from "@/lib/http";
import { missingChecksTable } from "./store";

export async function setCheckDismissed(actor: Actor, id: string, dismiss: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found", "No such finding");
  try {
    const [row] = await getDb().update(schema.projectChecks).set({ dismissedAt: dismiss ? new Date() : null, dismissedBy: dismiss ? actor.label : null })
      .where(and(eq(schema.projectChecks.id, id), eq(schema.projectChecks.userId, actor.userId))).returning();
    if (!row) throw new ApiError(404, "not_found", "No such finding");
    await appendAudit({ actor: actor.label, userId: actor.userId, action: dismiss ? "check.dismissed" : "check.restored", target: `project_check:${id}` });
    return { id, dismissedAt: row.dismissedAt };
  } catch (err) {
    if (missingChecksTable(err)) return { ready: false };
    throw err;
  }
}
