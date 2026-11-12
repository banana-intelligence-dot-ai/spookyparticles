import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { missingChecksTable } from "@/lib/checks/store";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };
async function change(req: Request, ctx: Ctx, dismiss: boolean) {
  const actor = await requireActor(req, "write");
  if (actor.via !== "session") throw new ApiError(403, "session_required", "Sign in to dismiss a finding");
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found", "No such finding");
  try {
    const [row] = await getDb().update(schema.projectChecks).set({ dismissedAt: dismiss ? new Date() : null, dismissedBy: dismiss ? actor.label : null })
      .where(and(eq(schema.projectChecks.id, id), eq(schema.projectChecks.userId, actor.userId))).returning();
    if (!row) throw new ApiError(404, "not_found", "No such finding");
    await appendAudit({ actor: actor.label, userId: actor.userId, action: dismiss ? "check.dismissed" : "check.restored", target: `project_check:${id}` });
    return json({ id, dismissedAt: row.dismissedAt });
  } catch (err) {
    if (missingChecksTable(err)) return json({ ready: false });
    throw err;
  }
}
export const POST = api<Ctx>((req, ctx) => change(req, ctx, true));
export const DELETE = api<Ctx>((req, ctx) => change(req, ctx, false));
