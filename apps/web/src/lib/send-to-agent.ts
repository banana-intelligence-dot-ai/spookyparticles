/**
 * "Send to my agent now": start the project's GitHub fix job by hand. Same dispatch as the pager,
 * so the job claims the break for 15 minutes and Today reads "a GitHub job claimed it".
 * Refuses when an agent already holds the break, so two fixers never race.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "./actor";
import { claimFor, claimsFor } from "./claims";
import { ApiError } from "./http";
import { pageGithub } from "./pager";
import { routingStatus } from "./break-guide";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NO_RESPONDER = "No GitHub responder for this project.";
export const SETUP_HINT = "Add the fix job to the repo and a GitHub responder: https://spookyparticles.com/setup.md (\"Always on: a fix job in GitHub\"). Until then, use Copy for agent.";

export type SendInput = { project: string; what: string; jobId?: string | null };
export type SendResult = { sent: boolean; message: string };

/** Pure: checks the input and returns the cleaned values, or throws a 400. */
export function sendInput(body: unknown): { project: string; what: string; jobId: string | null } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const project = typeof b.project === "string" ? b.project.trim() : "";
  const what = typeof b.what === "string" ? b.what.trim() : "";
  if (!project || project.length > 120) throw new ApiError(400, "project_required", "Name the project: owner/repo or the Vercel project name.");
  if (!what || what.length > 300) throw new ApiError(400, "what_required", "Say what broke, in up to 300 characters.");
  if (b.jobId != null && (typeof b.jobId !== "string" || !UUID.test(b.jobId))) throw new ApiError(400, "bad_job", "jobId must be a job ID from list_jobs.");
  return { project, what, jobId: (b.jobId as string | null | undefined) ?? null };
}

/** Pure: the answer the person reads. */
export function sendMessage(result: { ok: boolean; reason?: string }): SendResult {
  if (result.ok) return { sent: true, message: "Sent. Your GitHub fix job is on it." };
  if (result.reason === NO_RESPONDER) return { sent: false, message: `No fix job is set up for this project. ${SETUP_HINT}` };
  return { sent: false, message: `Not sent: ${result.reason ?? "GitHub did not start the job."}` };
}

export async function sendToAgent(actor: Actor, input: SendInput, nowMs = Date.now()): Promise<SendResult> {
  const { project, what, jobId } = sendInput(input);
  const claim = claimFor(await claimsFor(actor.userId, nowMs), project);
  if (claim) return { sent: false, message: `Already taken. ${routingStatus("deploy_failed", claim, nowMs).text.replace(/^Sent to your agents\. /, "")}` };
  let job: string | null = null;
  if (jobId) {
    const [row] = await getDb().select({ id: schema.checkinJobs.id }).from(schema.checkinJobs).where(and(eq(schema.checkinJobs.id, jobId), eq(schema.checkinJobs.userId, actor.userId))).limit(1);
    job = row?.id ?? null;
  }
  return sendMessage(await pageGithub(actor.userId, { id: job ?? `break:${project.toLowerCase()}`, name: what, project }, what, actor.label));
}
