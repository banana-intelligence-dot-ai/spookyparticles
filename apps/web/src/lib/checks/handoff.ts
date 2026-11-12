import type { schema } from "@/db";
import { CHECK_CATALOG } from "./catalog";
import { CHECK_KEYS, type CheckKey } from "./rules";

export const MAX_ATTEMPTS = 3;
export const OPEN_FOR = 2 * 60 * 60 * 1000;
const WAIT_FOR = 7 * 24 * 60 * 60 * 1000;
export type Outcome = "pr_opened" | "told_person" | "could_not_fix" | "not_a_problem";
export type Attempt = Pick<typeof schema.checkAttempts.$inferSelect, "id" | "checkId" | "takenAt" | "outcome" | "prUrl" | "note" | "reportedAt">;
export type Finding = Pick<typeof schema.projectChecks.$inferSelect, "id" | "state" | "dismissedAt" | "firstOpenAt"> & { check?: string };

export function cleanNote(note: unknown): string | null {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") throw new Error("note must be text");
  // Control, zero-width and direction-changing characters can make text read as something it is not.
  return note.replace(/[\x00-\x1f\x7f-\x9f​-‏‪-‮⁠-⁩﻿]/g, "").trim().slice(0, 500) || null;
}

/** A pull request on github.com: an owner by GitHub's own name rules, a repo, a number, and nothing after it. */
export const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})\/pull\/([0-9]{1,9})$/;
/** "owner/repo#123" for a URL that passes PR_URL, else null. The page links only what this returns. */
export function prLabel(value: unknown): string | null {
  const match = typeof value === "string" ? PR_URL.exec(value) : null;
  return match && match[2] !== "." && match[2] !== ".." ? `${match[1]}/${match[2]}#${match[3]}` : null;
}

export function validPrUrl(value: unknown, repo: string | null): value is string {
  if (typeof value !== "string") return false;
  const match = PR_URL.exec(value);
  return !!match && match[2] !== "." && match[2] !== ".." && (!repo || `${match[1]}/${match[2]}`.toLowerCase() === repo.toLowerCase());
}

export const currentAttempts = (finding: Finding, attempts: Attempt[]) =>
  attempts.filter((a) => a.checkId === finding.id && finding.firstOpenAt && a.takenAt >= finding.firstOpenAt)
    .sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());

export const inProgress = (a: Attempt, now: Date) => !a.reportedAt && now.getTime() - a.takenAt.getTime() < OPEN_FOR;

export function handoffSummary(finding: Finding, attempts: Attempt[], now = new Date()) {
  const current = currentAttempts(finding, attempts);
  const latest = [...current].reverse().find((a) => a.reportedAt);
  return {
    attempts: current.length, max: MAX_ATTEMPTS, capped: current.length >= MAX_ATTEMPTS,
    inProgress: current.some((a) => inProgress(a, now)),
    last: latest ? { outcome: latest.outcome, prUrl: latest.prUrl, note: latest.note, at: latest.reportedAt } : null,
  };
}

export function queue(findings: Finding[], attempts: Attempt[], now = new Date()) {
  const live = findings.filter((f) => f.state === "open" && !f.dismissedAt);
  // An attempt on a finding that has since been fixed or dismissed holds nothing up.
  const active = attempts.find((a) => inProgress(a, now) && live.some((f) => f.id === a.checkId && currentAttempts(f, [a]).length));
  let waitingOnPerson = 0, needsPerson = 0;
  const eligible: Finding[] = [];
  for (const finding of live) {
    const current = currentAttempts(finding, attempts);
    const waiting = current.some((a) => a.reportedAt && (a.outcome === "pr_opened" || a.outcome === "told_person") && now.getTime() - a.reportedAt.getTime() < WAIT_FOR);
    if (waiting) waitingOnPerson++;
    if (current.length >= MAX_ATTEMPTS || current.some((a) => a.outcome === "not_a_problem") ||
      (finding.check && CHECK_KEYS.includes(finding.check as CheckKey) && CHECK_CATALOG[finding.check as CheckKey].agent.handoff === "person")) needsPerson++;
    if (current.length < MAX_ATTEMPTS && !current.some((a) => inProgress(a, now) || a.outcome === "not_a_problem") && !waiting) eligible.push(finding);
  }
  return { active, eligible, counts: { open: live.length, waitingOnPerson, needsPerson, inProgress: active ? 1 : 0 } };
}
