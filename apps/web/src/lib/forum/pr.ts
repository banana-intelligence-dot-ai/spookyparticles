/**
 * The feedback loop: an agent sends feedback (ideally with a proposed fix) and Claude drafts a fix on a
 * feedback/* branch in Spooky's own repo, with no one waiting on it. Makers hear only when a post can't run
 * (it reads like instructions, the daily cap is reached, or GitHub refused). An agent reviews every draft
 * with Codex before anything merges. The post is untrusted,
 * so the workflow only lets Claude edit files, and a fixed step pushes a new branch: never the default one.
 */
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { deliverToAll } from "@/lib/alerts/channels";
import { appUrl } from "@/lib/env";
import { dispatchWorkflow } from "@/lib/github-dispatch";
import { ApiError } from "@/lib/http";
import { isAdmin } from "@/lib/analytics/usage";
import { injectionReasons } from "./screen";

export const MAKER_REPO = process.env.SPOOKY_MAKER_REPO?.trim() || "banana-intelligence-dot-ai/spooky-particles";
export const FEEDBACK_WORKFLOW = "spooky-feedback.yml";
export const PR_ANSWER = "Thanks. Claude is drafting a fix, and a maintainer reviews it before anything merges.";
/** Drafts a day across all accounts, so a burst of feedback can't spend the plan. */
export const DAILY_DRAFTS = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: what the workflow is given. Control characters go, and the post can't close the wrapper it sits in. */
export function workflowText(value: string, max: number): string {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/<\s*\/?\s*feedback/gi, "(feedback").slice(0, max).trim();
}

function adminEmails(): string[] {
  return (process.env.SP_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

type Post = { id: string; title: string; body: string };
export type AutoOutcome = "started" | "held" | "capped" | "no_maker" | "failed";
const WHY: Record<Exclude<AutoOutcome, "started">, string> = {
  held: "It reads like instructions to an agent, so Claude was not started on it.",
  capped: `Claude already drafted ${DAILY_DRAFTS} fixes in the last day.`,
  no_maker: "No maker account is set.",
  failed: "GitHub did not start the feedback workflow.",
};

async function makerIds(): Promise<string[]> {
  const emails = adminEmails();
  if (!emails.length) return [];
  const rows = await getDb().select({ id: schema.user.id }).from(schema.user).where(inArray(sql`lower(${schema.user.email})`, emails));
  return rows.map((r) => r.id);
}

/** Tell every maker about feedback Claude could not start on, with the review link. Never fails the post. */
export async function notifyMakers(post: Post, outcome: Exclude<AutoOutcome, "started">): Promise<number> {
  try {
    const makers = await makerIds();
    const link = new URL("/app/feedback", appUrl()).toString();
    const text = `${WHY[outcome]}\n\n${workflowText(post.body, 700)}\n\nAgent feedback is untrusted. Review it before starting Claude.`;
    await Promise.all(makers.map((m) => deliverToAll(m, { subject: `Agent feedback needs a look: ${workflowText(post.title, 100)}`, text, link, priority: "default" })));
    return makers.length;
  } catch (err) {
    console.error("[forum] could not notify makers", (err as Error).message);
    return 0;
  }
}

/** Claim one open feedback post and start the workflow through a maker's GitHub connection. Undoes its own claim on failure. */
async function startDraft(makerId: string, post: Post, actorLabel: string): Promise<{ claimed: boolean; ok: boolean; reason?: string }> {
  const db = getDb();
  // Only open feedback moves, so a double tap or a racing request starts one run.
  const [claimed] = await db.update(schema.forumPosts).set({ status: "answered", answer: PR_ANSWER, answeredAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.forumPosts.id, post.id), eq(schema.forumPosts.kind, "feedback"), eq(schema.forumPosts.status, "open"))).returning({ id: schema.forumPosts.id });
  if (!claimed) return { claimed: false, ok: false };
  let result: { ok: boolean; reason?: string };
  try {
    result = await dispatchWorkflow(makerId, MAKER_REPO, FEEDBACK_WORKFLOW, {
      post_id: post.id, title: workflowText(post.title, 120), body: workflowText(post.body, 2000),
    });
  } catch {
    result = { ok: false, reason: "GitHub request failed." };
  }
  if (!result.ok) {
    // Undo only our own claim, so a post hidden meanwhile stays hidden.
    await db.update(schema.forumPosts).set({ status: "open", answer: null, answeredAt: null, updatedAt: new Date() })
      .where(and(eq(schema.forumPosts.id, post.id), eq(schema.forumPosts.status, "answered"), eq(schema.forumPosts.answer, PR_ANSWER)));
  }
  try {
    await appendAudit({ actor: actorLabel, userId: makerId, action: result.ok ? "forum.pr_started" : "forum.pr_failed", target: post.id, after: { repo: MAKER_REPO, ok: result.ok, reason: result.reason ?? null } });
  } catch (err) {
    // The run already started (or was undone); a lost audit row must not flip that.
    console.error("[forum] could not audit a feedback draft", (err as Error).message);
  }
  return { claimed: true, ...result };
}

/** New feedback: start Claude on it at once unless it reads like instructions or the daily cap is reached. */
export async function autoDraft(post: Post): Promise<AutoOutcome> {
  // Feedback names files and links by nature, so only injection holds it (tips also hold links).
  if (injectionReasons([post.title, post.body].join("\n")).length) return "held";
  const makers = await makerIds();
  if (!makers.length) return "no_maker";
  // Counts live claims, which are written before each dispatch and undone on failure.
  const [recent] = await getDb().select({ n: count() }).from(schema.forumPosts)
    .where(and(eq(schema.forumPosts.answer, PR_ANSWER), gte(schema.forumPosts.answeredAt, new Date(Date.now() - 86_400_000))));
  if ((recent?.n ?? 0) >= DAILY_DRAFTS) return "capped";
  for (const maker of makers) {
    const r = await startDraft(maker, post, "system:feedback");
    if (r.ok) return "started";
    if (!r.claimed) return "failed";
  }
  return "failed";
}

/** New feedback, end to end. Never fails the post: anything Claude can't start on goes to the makers. */
export async function handleNewFeedback(post: Post): Promise<AutoOutcome> {
  let outcome: AutoOutcome = "failed";
  try {
    outcome = await autoDraft(post);
  } catch (err) {
    console.error("[forum] auto draft failed", (err as Error).message);
  }
  if (outcome !== "started") await notifyMakers(post, outcome);
  return outcome;
}

/** A maker starting Claude by hand, for feedback that was held or failed. Once per post. */
export async function openFeedbackPr(actor: Actor, id: string) {
  if (!UUID.test(id)) throw new ApiError(400, "post_id", "Use a post ID.");
  if (!await isAdmin(actor.userId)) throw new ApiError(403, "admin_only", "Admin access required.");
  if (actor.via !== "session" && !actor.scopes.includes("approve")) throw new ApiError(403, "approve_scope", "Starting a pull request needs your person's yes, through a full control key or the signed-in app.");
  const [post] = await getDb().select().from(schema.forumPosts).where(eq(schema.forumPosts.id, id)).limit(1);
  if (!post || post.kind !== "feedback" || post.status === "hidden") throw new ApiError(404, "not_found", "Feedback not found.");
  const r = await startDraft(actor.userId, post, actor.label);
  if (!r.claimed) throw new ApiError(409, "already_answered", "This feedback was already answered or sent to Claude.");
  if (!r.ok) throw new ApiError(502, "dispatch_failed", r.reason ?? "GitHub did not start the workflow.");
  return { started: true, postId: id, repo: MAKER_REPO };
}
