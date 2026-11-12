/** POST: send one test notice to a single channel, so the owner sees it land before relying on it. */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { deliverTo } from "@/lib/alerts/channels";
import { decrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  const [c] = await getDb().select().from(schema.alertChannels).where(and(eq(schema.alertChannels.userId, actor.userId), eq(schema.alertChannels.id, id))).limit(1);
  if (!c) throw new ApiError(404, "not_found", "No such channel");
  const r = await deliverTo(c.kind, decrypt(c.encryptedTarget), {
    subject: "Spooky Particles: test alert",
    text: "This is what a quiet-job or failed-deploy alert looks like here. Nothing is wrong.",
    link: new URL("/app/jobs", appUrl()).toString(),
    priority: "default",
  });
  await getDb().update(schema.alertChannels).set(r.ok ? { lastOkAt: new Date(), lastError: null } : { lastError: (r.reason ?? "failed").slice(0, 120) }).where(eq(schema.alertChannels.id, id));
  if (!r.ok) throw new ApiError(502, "delivery_failed", `The channel did not accept it: ${r.reason ?? "unknown"}`);
  return json({ sent: true });
});
