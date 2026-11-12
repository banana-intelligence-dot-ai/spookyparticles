import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ModelUsage } from "@/lib/extract/claude";
import { costCents } from "@/lib/extract/pricing";

export type ModelStage = typeof schema.modelUsage.$inferInsert["stage"];

export class ModelBudgetExceeded extends Error {
  constructor(readonly cap: "user" | "day") {
    super(`model ${cap} budget exceeded`);
    this.name = "ModelBudgetExceeded";
  }
}

function capCents(name: "SP_MODEL_CAP_USER_CENTS" | "SP_MODEL_CAP_DAY_CENTS", fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const cap = Number(raw);
  if (!Number.isSafeInteger(cap) || cap < 0) throw new Error(`${name} must be a nonnegative integer`);
  return cap;
}

export async function assertModelBudget(userId: string): Promise<void> {
  const now = Date.now();
  const db = getDb();
  const [userRows, dayRows] = await Promise.all([
    db.select({ cents: sql<number>`coalesce(sum(${schema.modelUsage.costCents}), 0)` })
      .from(schema.modelUsage)
      .where(and(eq(schema.modelUsage.userId, userId), gte(schema.modelUsage.createdAt, new Date(now - 30 * 24 * 60 * 60 * 1000)))),
    db.select({ cents: sql<number>`coalesce(sum(${schema.modelUsage.costCents}), 0)` })
      .from(schema.modelUsage)
      .where(gte(schema.modelUsage.createdAt, new Date(now - 24 * 60 * 60 * 1000))),
  ]);
  if (Number(userRows[0]?.cents ?? 0) >= capCents("SP_MODEL_CAP_USER_CENTS", 1000)) throw new ModelBudgetExceeded("user");
  if (Number(dayRows[0]?.cents ?? 0) >= capCents("SP_MODEL_CAP_DAY_CENTS", 5000)) throw new ModelBudgetExceeded("day");
}

/** Accounting must never turn a completed model call into a failed read. */
export async function recordModelUsage(input: { userId: string; connectionId: string | null; stage: ModelStage; usage: ModelUsage }): Promise<void> {
  try {
    await getDb().insert(schema.modelUsage).values({
      userId: input.userId,
      connectionId: input.connectionId,
      stage: input.stage,
      model: input.usage.model,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      cacheReadTokens: input.usage.cacheReadTokens,
      costCents: costCents(input.usage),
    });
  } catch {
    console.warn("[model-usage] failed to record model usage");
  }
}

export async function modelSpendSummary(userId: string) {
  const db = getDb();
  const [stages, globalRows] = await Promise.all([
    db.select({ stage: schema.modelUsage.stage, costCents: sql<number>`coalesce(sum(${schema.modelUsage.costCents}), 0)` })
      .from(schema.modelUsage)
      .where(eq(schema.modelUsage.userId, userId))
      .groupBy(schema.modelUsage.stage),
    db.select({ costCents: sql<number>`coalesce(sum(${schema.modelUsage.costCents}), 0)` })
      .from(schema.modelUsage)
      .where(gte(schema.modelUsage.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
  ]);
  const userByStage: Record<ModelStage, number> = {
    sender_verdict: 0,
    extract_cheap: 0,
    extract_escalate: 0,
    recipe_build: 0,
  };
  for (const row of stages) userByStage[row.stage] = Number(row.costCents);
  return {
    userByStage,
    globalLast24hCents: Number(globalRows[0]?.costCents ?? 0),
  };
}
