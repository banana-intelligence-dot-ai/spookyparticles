import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const REFUSAL_TTL_MS = 24 * 60 * 60_000;
export const SCHEDULES_REFUSED_AT = "schedules_refused_at";
export const ENV_LIST_REFUSED_AT = "env_list_refused_at";
export const OBSERVABILITY_REFUSED_AT = "observability_refused_at";
export const EXTERNAL_APIS_REFUSED_AT = "external_apis_refused_at";
export const WEB_ANALYTICS_REFUSED_AT = "web_analytics_refused_at";

export type RefusalProgress = { refused: boolean; read: boolean; skip: boolean };

/** A successful read anywhere in an account keeps project-specific refusals local. */
export function advanceRefusalProgress(progress: RefusalProgress, outcome: Pick<RefusalProgress, "refused" | "read">): RefusalProgress {
  const read = progress.read || outcome.read;
  return {
    refused: progress.refused || outcome.refused,
    read,
    skip: !read && (progress.skip || outcome.refused),
  };
}

/** Success clears a cached refusal even when another project was refused. */
export function refusalPersistence(outcome: Pick<RefusalProgress, "refused" | "read">): "clear" | "refuse" | null {
  if (outcome.read) return "clear";
  if (outcome.refused) return "refuse";
  return null;
}

/** A refusal suppresses the same optional read for 24 hours, then permits one retry. */
export function isFreshRefusal(value: unknown, nowMs = Date.now()): boolean {
  if (typeof value !== "string") return false;
  const refusedAt = Date.parse(value);
  const age = nowMs - refusedAt;
  return Number.isFinite(refusedAt) && age >= 0 && age < REFUSAL_TTL_MS;
}

/** Store or clear one optional Vercel read refusal without replacing the node's other attributes. */
export async function persistNodeRefusal(nodeId: string, attribute: string, outcome: Pick<RefusalProgress, "refused" | "read">, nowMs = Date.now()): Promise<void> {
  const action = refusalPersistence(outcome);
  if (!action) return;
  const attributes = action === "refuse"
    ? sql`${schema.nodes.attributes} || ${JSON.stringify({ [attribute]: new Date(nowMs).toISOString() })}::jsonb`
    : sql`${schema.nodes.attributes} - ${attribute}::text`;
  await getDb().update(schema.nodes).set({ attributes }).where(eq(schema.nodes.id, nodeId));
}
