/**
 * GET /api/health/watch: has our own watcher run lately? Public on purpose and tiny: a time and
 * a yes or no, nothing about any account. A script outside this product polls it, because a
 * watcher cannot be trusted to report its own death. 200 when healthy, 503 when not.
 */
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema } from "@/db";
import { watchHealth } from "@/lib/health";

export async function GET() {
  await connection();
  let body: ReturnType<typeof watchHealth> | { ok: false; reason: "unreachable"; lastRunAt: null; ageSeconds: null };
  try {
    const [beat] = await getDb().select().from(schema.systemHeartbeats).where(eq(schema.systemHeartbeats.name, "watch")).limit(1);
    body = watchHealth(beat ?? null, Date.now());
  } catch {
    body = { ok: false, reason: "unreachable", lastRunAt: null, ageSeconds: null };
  }
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
