/**
 * Agent first: when a job breaks and a coding agent is listening for its project, the agent hears
 * first and the person is emailed only if it is still broken 30 minutes later. When it comes back
 * before then, nobody is emailed. With no agent listening, the person hears at once, as before.
 * On by default; each account can turn it off (API, MCP tool). Every change is audited.
 * "Listening" means an agent key read the incident inbox for that project in the last 24 hours.
 */
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appUrl } from "@/lib/env";
import { appendAudit } from "./audit";
import { deliverToAll } from "./alerts/channels";
import { INBOX_READ } from "./agent-listening";
import { matchesIncidentProject } from "./incidents";

export const AGENT_FIRST_ON = "agent_first.on";
export const AGENT_FIRST_OFF = "agent_first.off";
export const AGENT_FIRST_WAIT_MS = 30 * 60_000;
const LISTENING_MS = 24 * 3_600_000;

export async function agentFirstEnabled(userId: string): Promise<boolean> {
  const [last] = await getDb()
    .select({ name: schema.events.name })
    .from(schema.events)
    .where(and(eq(schema.events.userId, userId), inArray(schema.events.name, [AGENT_FIRST_ON, AGENT_FIRST_OFF])))
    .orderBy(desc(schema.events.createdAt))
    .limit(1);
  return last ? last.name === AGENT_FIRST_ON : true;
}

export async function setAgentFirst(actor: { userId: string; label: string }, on: boolean): Promise<boolean> {
  const before = await agentFirstEnabled(actor.userId);
  if (before === on) return on;
  await getDb().insert(schema.events).values({ userId: actor.userId, name: on ? AGENT_FIRST_ON : AGENT_FIRST_OFF, properties: {} });
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "agent_first.set", target: "agent_first", before: { on: before }, after: { on } });
  return on;
}

/** Pure: whether any recent inbox read names this project. */
export function listensFor(readProjects: string[], project: string | null): boolean {
  return Boolean(project) && readProjects.some((p) => matchesIncidentProject(project, p));
}

/** Whether this break should go to the agent first. Quiet on failure: the person hears instead. */
export async function shouldDeferToAgent(userId: string, project: string | null, nowMs = Date.now()): Promise<boolean> {
  if (!project) return false;
  try {
    if (!(await agentFirstEnabled(userId))) return false;
    const reads = await getDb()
      .select({ properties: schema.events.properties })
      .from(schema.events)
      .where(and(eq(schema.events.userId, userId), eq(schema.events.name, INBOX_READ), gte(schema.events.createdAt, new Date(nowMs - LISTENING_MS))))
      .limit(200);
    return listensFor(reads.map((r) => r.properties.project).filter((p): p is string => typeof p === "string"), project);
  } catch (err) {
    console.warn("[agent-first] check failed, telling the person", (err as Error).message);
    return false;
  }
}

/** Pure: what to do with a held alert once its wait is over. */
export function heldOutcome(jobStatus: string | null): "email" | "resolved" {
  return jobStatus === "down" || jobStatus === "late" ? "email" : "resolved";
}

/**
 * Called by the watcher. Held alerts older than 30 minutes: still broken, email the person and say
 * the agent has not fixed it; fixed, close it quietly. Looks back one day so a long outage of
 * Spooky itself never sends a burst of stale alerts.
 */
export async function escalateAgentAlerts(nowMs = Date.now()): Promise<{ emailed: number; resolved: number }> {
  const db = getDb();
  const held = await db
    .select({ id: schema.alerts.id, userId: schema.alerts.userId, subject: schema.alerts.subject, payload: schema.alerts.payload, createdAt: schema.alerts.createdAt })
    .from(schema.alerts)
    .where(and(isNull(schema.alerts.sentAt), sql`${schema.alerts.payload}->>'deferred' = 'agent'`, sql`${schema.alerts.payload}->>'held' is null`, lt(schema.alerts.createdAt, new Date(nowMs - AGENT_FIRST_WAIT_MS)), gte(schema.alerts.createdAt, new Date(nowMs - 86_400_000))))
    .limit(50);
  let emailed = 0;
  let resolved = 0;
  for (const a of held) {
    const jobId = typeof a.payload.jobId === "string" ? a.payload.jobId : null;
    const [job] = jobId ? await db.select({ status: schema.checkinJobs.status, name: schema.checkinJobs.name, project: schema.checkinJobs.project }).from(schema.checkinJobs).where(eq(schema.checkinJobs.id, jobId)).limit(1) : [];
    if (heldOutcome(job?.status ?? null) === "resolved") {
      await db.update(schema.alerts).set({ payload: sql`${schema.alerts.payload} || ${JSON.stringify({ held: "resolved" })}::jsonb` }).where(eq(schema.alerts.id, a.id));
      await appendAudit({ actor: "system:agent-first", userId: a.userId, action: "alert.resolved_by_agent_window", target: `alert:${a.id}`, after: { job: job?.name ?? null } });
      resolved += 1;
      continue;
    }
    const text = `${typeof a.payload.text === "string" ? a.payload.text : a.subject}\nYour agent was told ${Math.round((nowMs - a.createdAt.getTime()) / 60_000)} min ago and it is still broken.`;
    const results = await deliverToAll(a.userId, { subject: `${a.subject} (your agent hasn't fixed it)`, text, link: new URL("/app/jobs", appUrl()).toString(), priority: "high" }, job?.project ?? null);
    const anyOk = results.some((r) => r.ok);
    await db
      .update(schema.alerts)
      .set({ sentAt: anyOk ? new Date(nowMs) : null, error: anyOk ? null : (results.map((r) => `${r.kind}: ${r.reason ?? "failed"}`).join("; ") || "no channel").slice(0, 200), payload: sql`${schema.alerts.payload} || ${JSON.stringify({ held: "emailed", deliveries: results })}::jsonb` })
      .where(eq(schema.alerts.id, a.id));
    await appendAudit({ actor: "system:agent-first", userId: a.userId, action: anyOk ? "alert.sent" : "alert.failed", target: `alert:${a.id}`, after: { job: job?.name ?? null, afterAgent: true } });
    emailed += 1;
  }
  return { emailed, resolved };
}
