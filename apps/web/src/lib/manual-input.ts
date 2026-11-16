/**
 * "Any manual input is error" (Nate, 2026-11-16). Counts the steps a person took by hand
 * versus the steps an agent or Spooky took, from the audit log, so the number can go down.
 * A step is one audited change. Reading a page is not a step.
 */
import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Steps that stay human for now: a yes to a sign-in, connecting an account, a merge, or deleting the account. */
export const REQUIRED_HUMAN = new Set([
  "device.approved",
  "device.denied",
  "connection.connected",
  "check.merge.allowed",
  "check.merge.withdrawn",
  "account.deletion_scheduled",
  "account.deletion_cancelled",
]);

/** What a brand-new account asks of the person today: approve the agent's code, connect GitHub, connect Vercel. */
export const SETUP_HUMAN_STEPS = ["Approve the agent's sign-in code", "Connect GitHub", "Connect Vercel"] as const;

export type ManualInput = {
  days: number;
  humanSteps: number;
  /** Human steps not on the required list: the number to drive to zero. */
  avoidableHumanSteps: number;
  agentSteps: number;
  spookySteps: number;
  /** Human share of all steps, 0 to 1, or null with no steps. */
  humanShare: number | null;
  /** The avoidable human steps, most common first: what to automate next. */
  automateNext: { action: string; count: number }[];
  setupHumanSteps: number;
};

export function summarizeManual(rows: { actor: string; action: string }[], days: number): ManualInput {
  let human = 0, avoidable = 0, agent = 0, spooky = 0;
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.actor.startsWith("user:")) {
      human++;
      if (!REQUIRED_HUMAN.has(r.action)) {
        avoidable++;
        counts.set(r.action, (counts.get(r.action) ?? 0) + 1);
      }
    } else if (r.actor.startsWith("api_key:")) agent++;
    else spooky++;
  }
  const total = human + agent + spooky;
  return {
    days,
    humanSteps: human,
    avoidableHumanSteps: avoidable,
    agentSteps: agent,
    spookySteps: spooky,
    humanShare: total ? Math.round((human / total) * 1000) / 1000 : null,
    automateNext: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([action, count]) => ({ action, count })),
    setupHumanSteps: SETUP_HUMAN_STEPS.length,
  };
}

export function clampDays(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw ?? 7);
  return Number.isFinite(n) ? Math.min(90, Math.max(1, Math.round(n))) : 7;
}

export async function manualInputFor(userId: string, days: number): Promise<ManualInput> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await getDb()
    .select({ actor: schema.auditLog.actor, action: schema.auditLog.action })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.userId, userId), gte(schema.auditLog.createdAt, since)));
  return summarizeManual(rows, days);
}
