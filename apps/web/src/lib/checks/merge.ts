/**
 * "Let my agent merge this": the person lets their own agent merge the pull request it opened
 * for a low-risk finding (the catalog's agentMerge list). Spooky never merges anything; it only
 * records the person's yes and hands it to the agent with strict rules. Every change is audited.
 * Lives in the events table: allowed, withdrawn, or declined by the agent with a reason.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { ApiError } from "@/lib/http";
import { CHECK_CATALOG } from "./catalog";
import { cleanNote, currentAttempts, WAIT_FOR, type Attempt, type Finding } from "./handoff";
import type { CheckKey } from "./rules";

export const MERGE_ALLOWED = "merge.allowed";
export const MERGE_WITHDRAWN = "merge.withdrawn";
export const MERGE_DECLINED = "merge.declined";
const NAMES = [MERGE_ALLOWED, MERGE_WITHDRAWN, MERGE_DECLINED];

export type MergeEvent = { name: string; properties: Record<string, unknown>; createdAt: Date };
export type MergeState = { canAllow: boolean; allowed: boolean; declined: string | null; prUrl: string | null };

/** Pure: the pull request waiting on the person for this finding, if any. */
export function waitingPr(finding: Finding, attempts: Attempt[], now: Date): string | null {
  if (finding.state !== "open" || finding.dismissedAt) return null;
  const last = [...currentAttempts(finding, attempts)].reverse().find((a) => a.reportedAt);
  return last?.outcome === "pr_opened" && last.prUrl && last.reportedAt && now.getTime() - last.reportedAt.getTime() < WAIT_FOR ? last.prUrl : null;
}

/** Pure: where the person's yes stands for this finding's waiting pull request. The newest event for that pull request wins. */
export function mergeState(finding: Finding, attempts: Attempt[], events: MergeEvent[], now: Date): MergeState | null {
  const prUrl = waitingPr(finding, attempts, now);
  const spec = finding.check ? CHECK_CATALOG[finding.check as CheckKey] : undefined;
  if (!prUrl || !spec?.agentMerge) return null;
  const last = events.filter((e) => e.properties.checkId === finding.id && e.properties.prUrl === prUrl).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return {
    canAllow: true, prUrl,
    allowed: last?.name === MERGE_ALLOWED,
    declined: last?.name === MERGE_DECLINED ? (typeof last.properties.note === "string" ? last.properties.note : "Your agent did not merge it.") : null,
  };
}

/** The rules the agent follows before it merges. Plain text: it is read by coding agents. */
export function mergeRules(files: string[]): string[] {
  return [
    "Merge only if every one of these is true. If any is not, do not merge: call decline_merge with the reason in one line.",
    "The pull request is still open, is the one named here, and you can see it with your own GitHub login.",
    `It changes only these files: ${files.join(", ")}. Check with: gh pr view <url> --json files`,
    "Every status check on it passed. Wait for them with: gh pr checks <url> --watch. Never skip, re-run to force, or bypass a check or a branch rule.",
    "Nobody asked for changes on it, and its branch is not behind in a way GitHub says needs a manual fix.",
    "Then merge with: gh pr merge <url> --squash. Do not delete anything else, and change nothing else in the repo.",
  ];
}

export type GrantedMerge = { findingId: string; project: string; prUrl: string; rules: string[] };

/** Pure: the merges the person allowed that no agent has declined or the person withdrew. */
export function grantedMerges(findings: (Finding & { project: string })[], attempts: Attempt[], events: MergeEvent[], now: Date): GrantedMerge[] {
  return findings.flatMap((f) => {
    const state = mergeState(f, attempts, events, now);
    const spec = CHECK_CATALOG[f.check as CheckKey];
    return state?.allowed && state.prUrl && spec?.agentMerge ? [{ findingId: f.id, project: f.project, prUrl: state.prUrl, rules: mergeRules(spec.agentMerge.files) }] : [];
  });
}

export async function readMergeEvents(userId: string): Promise<MergeEvent[]> {
  return getDb().select({ name: schema.events.name, properties: schema.events.properties, createdAt: schema.events.createdAt })
    .from(schema.events).where(and(eq(schema.events.userId, userId), inArray(schema.events.name, NAMES)));
}

type Load = { finding: Finding & { project: string }; attempts: Attempt[]; events: MergeEvent[] };

async function change(actor: Actor, findingId: string, load: (userId: string, findingId: string) => Promise<Load | null>, name: string, note: string | null) {
  const found = await load(actor.userId, findingId);
  if (!found) throw new ApiError(404, "not_found", "No such finding");
  const state = mergeState(found.finding, found.attempts, found.events, new Date());
  if (!state) throw new ApiError(409, "not_mergeable", "Only a low-risk finding with a pull request from your agent waiting can be merged by your agent.");
  await getDb().insert(schema.events).values({ userId: actor.userId, name, properties: { checkId: findingId, prUrl: state.prUrl, project: found.finding.project, ...(note ? { note } : {}) } });
  await appendAudit({ userId: actor.userId, actor: actor.label, action: `check.${name}`, target: `project_check:${findingId}`, after: { prUrl: state.prUrl, ...(note ? { note } : {}) } });
  return { findingId, prUrl: state.prUrl, allowed: name === MERGE_ALLOWED, declined: name === MERGE_DECLINED ? note : null };
}

/** The person says yes (or takes it back). Needs the web app or a full control key. */
export function setMergeAllowed(actor: Actor, findingId: string, allow: boolean, load: (userId: string, findingId: string) => Promise<Load | null>) {
  return change(actor, findingId, load, allow ? MERGE_ALLOWED : MERGE_WITHDRAWN, null);
}

/** The agent did not merge: it says why, and the person sees it. */
export function declineMerge(actor: Actor, findingId: string, note: unknown, load: (userId: string, findingId: string) => Promise<Load | null>) {
  let text: string | null;
  try { text = cleanNote(note); } catch { throw new ApiError(400, "invalid_note", "note must be text"); }
  if (!text) throw new ApiError(400, "note_required", "Say in one line why you did not merge.");
  return change(actor, findingId, load, MERGE_DECLINED, text);
}
