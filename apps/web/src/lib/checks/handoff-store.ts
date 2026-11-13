import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { ApiError } from "@/lib/http";
import { CHECK_CATALOG } from "./catalog";
import { cleanNote, inProgress, MAX_ATTEMPTS, OPEN_FOR, queue, validPrUrl, type Outcome } from "./handoff";
import { checkReport, linkedRepo } from "./report";
import { readChecks, missingTable } from "./store";
import { CHECK_KEYS, type CheckKey } from "./rules";

export async function readAttempts(userId: string) {
  try {
    return await getDb().select().from(schema.checkAttempts).where(eq(schema.checkAttempts.userId, userId));
  } catch (err) {
    if (missingTable(err, "check_attempts")) return [];
    throw err;
  }
}

async function context(userId: string) {
  const db = getDb();
  const [checks, nodes, attempts] = await Promise.all([
    readChecks(userId), db.select().from(schema.nodes).where(eq(schema.nodes.userId, userId)), readAttempts(userId),
  ]);
  return { checks, nodes, attempts, report: checkReport(nodes, checks.rows, checks.ready, attempts) };
}

export async function findingsReport(userId: string) { return (await context(userId)).report; }

/**
 * Take the next open finding, most serious first. With `only`, take that one finding: the person
 * handed it to this agent from the Check page. It must still be open to an agent (not fixed,
 * dismissed, waiting on a pull request, or out of tries); another finding in progress does not block it.
 */
export async function takeNext(actor: Actor, retried = false, only: string | null = null) {
  const { checks, attempts, report } = await context(actor.userId);
  if (!checks.ready) return { finding: null, attempt: null, counts: { open: 0, waitingOnPerson: 0, needsPerson: 0, inProgress: 0 }, ready: false };
  const ordered = report.projects.flatMap((p) => p.checks).filter((c) => c.id && (!only || c.id === only)).map((c) => checks.rows.find((r) => r.id === c.id)!);
  if (only && !ordered.length) throw new ApiError(404, "not_found", "No such finding");
  const { active, eligible, counts } = queue(ordered, attempts);
  const row = ordered.find((r) => r.id === (active?.checkId ?? eligible[0]?.id));
  if (only && !row) throw new ApiError(409, "not_available", "This finding is not open to an agent now: it was fixed or dismissed, a pull request for it is waiting, or it used its three tries. Tell your person.");
  if (!row) return { finding: null, attempt: null, counts };
  const project = report.projects.find((p) => p.checks.some((c) => c.id === row.id))!;
  const check = project.checks.find((c) => c.id === row.id)!;
  const key = row.check as CheckKey;
  const spec = CHECK_CATALOG[key];
  const finding = { id: row.id, project: project.name, repo: project.repo, productionUrl: project.productionUrl,
    check: key, title: check.title, severity: check.severity, why: check.why, limit: check.limit ?? null,
    fix: check.fix, evidence: check.evidence, ...spec.agent };
  if (active) return { finding, attempt: { id: active.id, number: attempts.filter((a) => a.checkId === row.id && row.firstOpenAt && a.takenAt >= row.firstOpenAt).length, max: MAX_ATTEMPTS, expiresAt: new Date(active.takenAt.getTime() + OPEN_FOR) }, counts };
  try {
    const [attempt] = await getDb().insert(schema.checkAttempts).values({ userId: actor.userId, checkId: row.id, actor: actor.label }).returning();
    await appendAudit({ userId: actor.userId, actor: actor.label, action: "check.taken", target: `project_check:${row.id}` });
    return { finding, attempt: { id: attempt.id, number: attempts.filter((a) => a.checkId === row.id && row.firstOpenAt && a.takenAt >= row.firstOpenAt).length + 1, max: MAX_ATTEMPTS, expiresAt: new Date(attempt.takenAt.getTime() + OPEN_FOR) }, counts: { ...counts, inProgress: 1 } };
  } catch (err) {
    if (missingTable(err, "check_attempts")) return { finding: null, attempt: null, counts, ready: false };
    if ((err as { code?: string; cause?: { code?: string } }).code === "23514" || (err as { cause?: { code?: string } }).cause?.code === "23514") {
      if (!retried) return takeNext(actor, true, only);
      throw new ApiError(409, "finding_changed", "This finding changed. Ask for the next finding again");
    }
    throw err;
  }
}

export async function reportAttempt(actor: Actor, input: { findingId: string; outcome: Outcome; prUrl?: unknown; note?: unknown }) {
  const { checks, nodes, attempts } = await context(actor.userId);
  const row = checks.rows.find((r) => r.id === input.findingId);
  if (!row) throw new ApiError(404, "no_attempt", "No finding or in-progress attempt with that ID");
  const attempt = [...attempts].reverse().find((a) => a.checkId === row.id && row.firstOpenAt && a.takenAt >= row.firstOpenAt && inProgress(a, new Date()));
  if (!attempt) throw new ApiError(409, "no_attempt", "No in-progress attempt for this finding");
  if (!["pr_opened", "told_person", "could_not_fix", "not_a_problem"].includes(input.outcome)) throw new ApiError(400, "invalid_outcome", "Choose a valid outcome");
  const project = nodes.find((n) => n.id === row.nodeId);
  const repo = project ? linkedRepo(project) : null;
  if (input.outcome === "pr_opened" && !CHECK_KEYS.includes(row.check as CheckKey)) throw new ApiError(400, "invalid_check", "Unknown check");
  if (input.outcome === "pr_opened" && CHECK_CATALOG[row.check as CheckKey].agent.handoff !== "pull_request") throw new ApiError(400, "invalid_outcome", "This finding needs a person, not a pull request");
  if (input.outcome === "pr_opened" && !validPrUrl(input.prUrl, repo)) throw new ApiError(400, "invalid_pr_url", repo ? `Use a GitHub pull request URL in ${repo}` : "Use a GitHub pull request URL");
  if (input.outcome !== "pr_opened" && input.prUrl != null) throw new ApiError(400, "invalid_pr_url", "A pull request URL is only for pr_opened");
  let note: string | null;
  try { note = cleanNote(input.note); } catch { throw new ApiError(400, "invalid_note", "note must be text"); }
  try {
    const [updated] = await getDb().update(schema.checkAttempts).set({ outcome: input.outcome, prUrl: input.outcome === "pr_opened" ? input.prUrl as string : null, note, reportedAt: new Date() })
      .where(and(eq(schema.checkAttempts.id, attempt.id), eq(schema.checkAttempts.userId, actor.userId), eq(schema.checkAttempts.checkId, row.id), isNull(schema.checkAttempts.reportedAt), gt(schema.checkAttempts.takenAt, new Date(Date.now() - OPEN_FOR)))).returning();
    if (!updated) throw new ApiError(409, "already_reported", "This attempt was already reported");
    await appendAudit({ userId: actor.userId, actor: actor.label, action: "check.reported", target: `project_check:${row.id}`, after: { attemptId: attempt.id, outcome: input.outcome } });
    return { findingId: row.id, attemptId: attempt.id, outcome: updated.outcome, reportedAt: updated.reportedAt };
  } catch (err) {
    if (missingTable(err, "check_attempts")) throw new ApiError(503, "checks_unavailable", "The handoff is not available yet");
    throw err;
  }
}
