import type { Actor } from "@/lib/actor";
import { cleanCount, cleanMinutes, cleanName, cleanOwner, createJob, schedulePeriodMinutes } from "@/lib/checkins";
import { ApiError } from "@/lib/http";
import { MAX_PROBES_PER_ACCOUNT, probeRoomLeft, validateOutcomeInput } from "@/lib/probes";

/** Validates a new-job body and creates the job. Shared by POST /api/v1/checkins and the MCP create_job tool. */
export async function createJobFromBody(actor: Actor, body: Record<string, unknown>) {
  const name = cleanName(body.name);
  if (!name) throw new ApiError(400, "name", "name: 2 to 80 characters");
  let outcome: ReturnType<typeof validateOutcomeInput>;
  try { outcome = validateOutcomeInput(body.schedule, body.timeZone, body.probe); } catch (err) { throw new ApiError(400, "outcome", (err as Error).message); }
  if (outcome.probe && !(await probeRoomLeft(actor.userId))) throw new ApiError(400, "outcome", `probe: at most ${MAX_PROBES_PER_ACCOUNT} watched URLs per account`);
  const periodMinutes = cleanMinutes(body.periodMinutes, outcome.schedule ? schedulePeriodMinutes(outcome.schedule, outcome.timeZone ?? "UTC", Date.now()) : null);
  if (!periodMinutes) throw new ApiError(400, "period", "periodMinutes: whole minutes, 1 to 44640");
  const graceMinutes = cleanMinutes(body.graceMinutes, Math.max(5, Math.min(60, Math.round(periodMinutes / 10))), 60 * 24 * 7);
  if (graceMinutes === null) throw new ApiError(400, "grace", "graceMinutes: whole minutes");
  const project = typeof body.project === "string" && body.project.trim() ? body.project.trim().slice(0, 120) : null;
  const owner = cleanOwner(body.owner);
  if (owner && owner.length > 80 || body.owner !== undefined && body.owner !== null && typeof body.owner !== "string") throw new ApiError(400, "owner", "owner: up to 80 characters");
  const maxRunMinutes = cleanMinutes(body.maxRunMinutes, null, 10080);
  if (body.maxRunMinutes != null && maxRunMinutes === null) throw new ApiError(400, "max_run_minutes", "maxRunMinutes: whole minutes, 1 to 10080");
  const minCount = body.minCount == null ? null : cleanCount(body.minCount);
  if (body.minCount != null && minCount === null) throw new ApiError(400, "min_count", "minCount: whole count, 0 to 1000000000");
  return createJob({ userId: actor.userId, name, periodMinutes, graceMinutes, project, owner, maxRunMinutes, minCount, ...outcome, actor: actor.label });
}
