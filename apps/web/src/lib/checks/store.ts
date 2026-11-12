import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { keepPriorAnswer, transition, type CheckKey, type Decision } from "./rules";

export function missingTable(err: unknown, table: "project_checks" | "check_attempts"): boolean {
  const e = err as { code?: string; cause?: { code?: string; message?: string }; message?: string };
  const message = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  return message.includes(`relation "${table}" does not exist`) ||
    ((e?.code === "42P01" || e?.cause?.code === "42P01") && (!message.includes('relation "') || message.includes(`relation "${table}"`)));
}
export const missingChecksTable = (err: unknown) => missingTable(err, "project_checks");

export async function saveCheck(userId: string, nodeId: string, check: CheckKey, result: Decision, now = new Date()): Promise<boolean> {
  try {
    const db = getDb();
    const [prior] = await db.select().from(schema.projectChecks).where(and(eq(schema.projectChecks.userId, userId), eq(schema.projectChecks.nodeId, nodeId), eq(schema.projectChecks.check, check))).limit(1);
    if (keepPriorAnswer(prior ?? null, result, now)) return true;
    const dates = transition(prior ?? null, result.state, now);
    await db.insert(schema.projectChecks).values({ userId, nodeId, check, state: result.state, reason: result.reason, source: "verified", evidence: result.evidence, checkedAt: now, ...dates })
      .onConflictDoUpdate({ target: [schema.projectChecks.userId, schema.projectChecks.nodeId, schema.projectChecks.check], set: { state: result.state, reason: result.reason, source: "verified", evidence: result.evidence, checkedAt: now, ...dates } });
    return true;
  } catch (err) {
    if (missingChecksTable(err)) return false;
    throw err;
  }
}

export async function readChecks(userId: string) {
  try {
    return { ready: true as const, rows: await getDb().select().from(schema.projectChecks).where(eq(schema.projectChecks.userId, userId)) };
  } catch (err) {
    if (missingChecksTable(err)) return { ready: false as const, rows: [] };
    throw err;
  }
}
