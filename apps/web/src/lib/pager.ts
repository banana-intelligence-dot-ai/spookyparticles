/** GitHub-first fix jobs and their fifteen-minute human escalation. */
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { dispatchWorkflow } from "@/lib/github-dispatch";
import { CLAIMED } from "@/lib/claims";
import { deliverToAll, matchesProject } from "@/lib/alerts/channels";
import { ignoredKeys } from "@/lib/ignores";
import { alertMuted } from "@/lib/mutes";
import { alarmFor, alarmLine, alarmsFor, normCheck } from "@/lib/alarms";
import { sameProject } from "@/lib/break-guide";

const FIFTEEN_MINUTES = 15 * 60_000;
const DAY = 24 * 60 * 60_000;
/** Three fix runs on one check in a week that didn't hold: the next break goes to a person, with the evidence. */
export const MAX_ROUNDS = 3;
const ROUND_WINDOW = 7 * DAY;

export function pagerEnabled(): boolean {
  return process.env.SPOOKY_PAGER_GITHUB === "on";
}

export type PagerJob = { id: string; name: string; project: string | null; lastNote?: string | null; alertKey?: string };
export type PageResult = { ok: boolean; reason?: string };

/** Keep untrusted job text short and safe for workflow inputs. */
export function cleanPagerInput(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e\p{L}\p{N}]/gu, "").slice(0, 300);
}

/** Every fix job hears this, so a broken check is fixed at its cause and never made to pass by weakening it. */
export const FIX_RULE = "Fix the cause. Never make a check pass by weakening it: no lower thresholds, no skipped or deleted checks, tests or alerts.";

/** Pure: what the fix job is told. The rule always fits; the report is cut to make room. */
export function pagerWhat(what: string): string {
  return `${cleanPagerInput(what).slice(0, 300 - FIX_RULE.length - 1).trim()} ${FIX_RULE}`.trim();
}


const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: the fix runs that started for one check, oldest first. Each began a new break, so each one didn't hold. */
export function roundsSpent(rows: { after: unknown; createdAt: Date }[]): Date[] {
  return rows.filter((r) => (r.after as { ok?: unknown } | null)?.ok === true).map((r) => r.createdAt).sort((a, b) => a.getTime() - b.getTime());
}

/** Pure: what the person reads when the fix job stops. */
export function roundsReason(rounds: Date[], repo: string): string {
  const when = rounds.slice(-MAX_ROUNDS).map((d) => `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)}`).join(", ");
  return `${rounds.length} fix runs for this check in 7 days didn't hold (${when} UTC), so Spooky stopped starting new ones. It's over to you. The runs: https://github.com/${repo}/actions/workflows/spooky-fix.yml`;
}

/** Dispatch through the connected installation. No token enters a result, event, or log. `actor` is who asked (the pager, or a person or key sending by hand). */
export async function pageGithub(userId: string, job: PagerJob, what: string, actor = "system:pager"): Promise<PageResult> {
  const db = getDb();
  const alarms = await alarmsFor(userId);
  const lowerWhat = what.toLowerCase();
  const alarm = alarmFor(alarms, job.project, [job.name]) ?? alarms.find((candidate) =>
    Boolean(job.project) && sameProject(candidate.project, job.project!) && lowerWhat.includes(normCheck(candidate.check))) ?? null;
  let channel: typeof schema.alertChannels.$inferSelect | undefined;
  let repo = "";
  let result: PageResult = { ok: false, reason: "No GitHub responder for this project." };
  let stopped = false;
  const target = JOB_ID.test(job.id) ? `checkin_job:${job.id}` : job.id.slice(0, 160);
  try {
    const channels = await db.select().from(schema.alertChannels).where(and(eq(schema.alertChannels.userId, userId), eq(schema.alertChannels.kind, "github"), eq(schema.alertChannels.enabled, true)));
    channel = channels.find((c) => c.project && matchesProject(c.project, job.project));
    if (!channel) return result;
    repo = decrypt(channel.encryptedTarget);
    // The pager stops after three rounds; a person sending it by hand still can.
    if (actor === "system:pager") {
      const rows = await db.select({ after: schema.auditLog.after, createdAt: schema.auditLog.createdAt }).from(schema.auditLog)
        .where(and(eq(schema.auditLog.userId, userId), eq(schema.auditLog.action, "pager.github_dispatched"), eq(schema.auditLog.target, target), gte(schema.auditLog.createdAt, new Date(Date.now() - ROUND_WINDOW))));
      const rounds = roundsSpent(rows);
      if (rounds.length >= MAX_ROUNDS) {
        stopped = true;
        result = { ok: false, reason: roundsReason(rounds, repo) };
        return result;
      }
    }
    result = await dispatchWorkflow(userId, repo, "spooky-fix.yml", {
      project: cleanPagerInput(job.project ?? ""), check: cleanPagerInput(job.name),
      what: pagerWhat(alarm ? `${alarmLine(alarm)} ${what}` : what), link: cleanPagerInput(new URL("/app/jobs", appUrl()).toString()),
    });
    if (result.ok) {
      const at = new Date();
      await db.insert(schema.events).values({ userId, name: CLAIMED, properties: { project: job.project?.trim().toLowerCase(), apiKeyId: null, via: "github", ms: FIFTEEN_MINUTES }, createdAt: at });
      // Only a watched job has a fifteen-minute escalation; a deploy break has no job row.
      if (JOB_ID.test(job.id)) await db.insert(schema.events).values({ userId, name: "pager.paged", properties: { jobId: job.id, project: job.project, alertKey: job.alertKey ?? "", at: at.toISOString() }, createdAt: at });
    }
  } catch {
    result = { ok: false, reason: "GitHub request failed." };
  } finally {
    if (stopped) await appendAudit({ actor, userId, action: "pager.rounds_exhausted", target, after: { repo, reason: result.reason ?? null } });
  }
  if (channel && !stopped) {
    await db.update(schema.alertChannels).set(result.ok ? { lastOkAt: new Date(), lastError: null } : { lastError: (result.reason ?? "failed").slice(0, 120) }).where(eq(schema.alertChannels.id, channel.id));
    await appendAudit({ actor, userId, action: "pager.github_dispatched", target, after: { repo, ok: result.ok, reason: result.reason ?? null } });
  }
  return result;
}

export type Paged = { jobId: string; userId: string; project: string | null; alertKey: string; at: string };
export type EscalationJob = { id: string; userId: string; name: string; project: string | null; status: string; lastNote: string | null };

/** Pure decision; the alerts unique key handles races in the sending pass. */
export function dueEscalations(paged: Paged[], escalatedJobIds: Set<string>, jobsById: Map<string, EscalationJob>, nowMs: number): Paged[] {
  return paged.filter((p) => nowMs - Date.parse(p.at) >= FIFTEEN_MINUTES &&
    !escalatedJobIds.has(p.jobId) && jobsById.get(p.jobId)?.status === "down");
}

export async function escalatePages(nowMs = Date.now()): Promise<number> {
  if (!pagerEnabled()) return 0;
  const db = getDb();
  const rows = await db.select().from(schema.events).where(and(inArray(schema.events.name, ["pager.paged", "pager.escalated"]), gte(schema.events.createdAt, new Date(nowMs - DAY))));
  const allPaged: Paged[] = rows.filter((r) => r.name === "pager.paged" && typeof r.properties.jobId === "string" && typeof r.userId === "string").map((r) => ({
    jobId: r.properties.jobId as string, userId: r.userId!, project: typeof r.properties.project === "string" ? r.properties.project : null,
    alertKey: String(r.properties.alertKey ?? ""), at: String(r.properties.at ?? r.createdAt.toISOString()),
  }));
  const paged = [...new Map(allPaged.sort((a, b) => a.at.localeCompare(b.at)).map((p) => [`${p.userId}:${p.jobId}`, p])).values()];
  if (!paged.length) return 0;
  const jobs = await db.select().from(schema.checkinJobs).where(inArray(schema.checkinJobs.id, [...new Set(paged.map((p) => p.jobId))]));
  const escalated = new Set(rows.filter((r) => r.name === "pager.escalated" && paged.some((p) => p.jobId === r.properties.jobId && p.at === r.properties.pagedAt)).map((r) => String(r.properties.jobId ?? "")));
  const due = dueEscalations(paged, escalated, new Map(jobs.map((j) => [j.id, j])), nowMs);
  let sent = 0;
  for (const p of due) {
    const job = jobs.find((j) => j.id === p.jobId && j.userId === p.userId);
    // Muted, or the owner cleared this episode's notice: nobody wants the second ping.
    if (!job || (await alertMuted(p.userId, job.project, "job_quiet")) || (await ignoredKeys(p.userId)).has(p.alertKey)) continue;
    const key = `pager_escalated:${p.jobId}:${p.at}`;
    const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, p.userId)).limit(1);
    const [row] = await db.insert(schema.alerts).values({ userId: p.userId, kind: "job_quiet", key, channel: "channels", to: person?.email ?? "", subject: `${job.name}: still broken after 15 min`, payload: { jobId: job.id, project: job.project, pagedAt: p.at } })
      .onConflictDoNothing({ target: [schema.alerts.userId, schema.alerts.key] }).returning({ id: schema.alerts.id });
    if (!row) continue;
    await db.insert(schema.events).values({ userId: p.userId, name: "pager.escalated", properties: { jobId: p.jobId, pagedAt: p.at }, createdAt: new Date(nowMs) });
    const hhmm = new Date(p.at).toISOString().slice(11, 16);
    const results = await deliverToAll(p.userId, { subject: `${job.name}: still broken after 15 min`, text: `Spooky paged a GitHub job at ${hhmm} UTC. It hasn't fixed it yet. Your agent machines can take it now.${job.lastNote ? `\n${job.lastNote}` : ""}`, link: new URL("/app/jobs", appUrl()).toString(), priority: "high" }, job.project);
    const ok = results.some((r) => r.ok);
    await db.update(schema.alerts).set({ sentAt: ok ? new Date(nowMs) : null, error: ok ? null : "no channel", payload: { jobId: job.id, project: job.project, pagedAt: p.at, deliveries: results } }).where(eq(schema.alerts.id, row.id));
    sent += 1;
  }
  return sent;
}
