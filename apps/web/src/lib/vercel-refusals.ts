export const REFUSAL_TTL_MS = 24 * 60 * 60_000;
export const SCHEDULES_REFUSED_AT = "schedules_refused_at";
export const ENV_LIST_REFUSED_AT = "env_list_refused_at";

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
