/** Database work for Vercel schedule discovery and the five minute watcher. */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { recordPing, sweepQuietJobs, type StoredJobStatus } from "@/lib/checkins";
import { getAccessToken } from "@/lib/connections";
import { randomToken } from "@/lib/crypto";
import type { VercelScope } from "@/lib/providers/vercel";
import { queryRequestCounts } from "@/lib/providers/vercel-query";
import { decideRuns, expectedRuns, nextRun, type Schedule } from "@/lib/vercel-schedules";

type HistoryResult = Awaited<ReturnType<typeof queryRequestCounts>>;
type HistoryCandidate = { id: string; scopes: string[]; status: string; encryptedAccessToken: string | null };

/** A query is made only for the returned try ID. Refusals advance; transient failures stop. */
export function historyChoice(currentId: string, connections: HistoryCandidate[], attempts: { id: string; result: HistoryResult }[]):
  { kind: "try" | "ok"; id: string } | { kind: "not_readable" | "unavailable" } {
  const last = attempts.at(-1);
  if (last?.result.ok) return { kind: "ok", id: last.id };
  if (last && !last.result.ok && last.result.reason === "unavailable") return { kind: "unavailable" };
  const alternatives = connections
    .filter((c) => c.id !== currentId && c.status === "active" && c.encryptedAccessToken)
    .sort((a, b) => Number(a.scopes.some((s) => s.startsWith("vercel-install:"))) - Number(b.scopes.some((s) => s.startsWith("vercel-install:"))))
    .slice(0, 3);
  const order = [currentId, ...alternatives.map((c) => c.id)];
  const next = order[attempts.length];
  return next ? { kind: "try", id: next } : { kind: "not_readable" };
}

export function scheduleConnectionId(prior: { vercelConnectionId: string | null; evidenceState: string | null } | undefined, activeIds: Set<string>, syncingId: string): string {
  return prior?.evidenceState === "ok" && prior.vercelConnectionId && activeIds.has(prior.vercelConnectionId)
    ? prior.vercelConnectionId : syncingId;
}

export function scheduleSyncStatus(prior: StoredJobStatus | undefined, shouldPause: boolean, restart: boolean): StoredJobStatus {
  if (prior === "retired") return "retired";
  return shouldPause ? "paused" : restart ? "up" : prior ?? "up";
}

/** Marks a pause the sync made, so the sync may lift it and never lifts a person's. */
const AUTO_NOTE = "auto:";

/**
 * A job whose history cannot be read has no evidence behind it. Unless its owner has sent a
 * check-in since the last good read, it must wait silently for one: never alert on silence
 * we cannot see. Found live 2026-11-10: such a job was alerting "still quiet" every period.
 */
export function mustWaitForCheckIn(job: { lastPingAt: Date | null; lastEvidenceCheckedAt: Date | null }): boolean {
  return !job.lastPingAt || !job.lastEvidenceCheckedAt || job.lastPingAt.getTime() <= job.lastEvidenceCheckedAt.getTime();
}

export async function syncScheduleJobs(input: { userId: string; connectionId: string; projectId: string; projectName: string; scopeId: string; deploymentId: string | null; hasProduction: boolean; schedules: Schedule[] }) {
  const db = getDb();
  const existing = await db.select().from(schema.checkinJobs).where(and(eq(schema.checkinJobs.userId, input.userId), eq(schema.checkinJobs.source, "vercel"), eq(schema.checkinJobs.vercelProjectId, input.projectId)));
  const activeConnections = await db.select({ id: schema.connections.id }).from(schema.connections).where(and(
    eq(schema.connections.userId, input.userId), eq(schema.connections.provider, "vercel"), eq(schema.connections.status, "active"),
  ));
  const activeIds = new Set(activeConnections.map((c) => c.id));
  const refs = new Set<string>();
  for (const s of input.schedules) {
    const externalRef = `${input.projectId}:${s.path}:${s.name}`;
    refs.add(externalRef);
    const first = nextRun(s.schedule, Date.now());
    const second = first === null ? null : nextRun(s.schedule, first);
    const periodMinutes = first !== null && second !== null ? Math.max(1, Math.round((second - first) / 60_000)) : 1440;
    const graceMinutes = periodMinutes >= 1440 ? 65 : 10;
    const prior = existing.find((j) => j.externalRef === externalRef);
    const changed = prior?.schedule !== s.schedule || prior?.path !== s.path;
    // Only a pause the sync made itself is lifted by the sync. A person's pause stays a pause.
    const shouldPause = first === null || !input.hasProduction;
    const autoPaused = prior?.status === "paused" && (prior.lastNote ?? "").startsWith(AUTO_NOTE);
    const restart = !prior || changed || autoPaused;
    const nextDueAt = first === null ? null : restart ? new Date(first) : prior.nextDueAt;
    const status = scheduleSyncStatus(prior?.status, shouldPause, restart);
    const values = {
      name: `${input.projectName}: ${s.path}`,
      project: input.projectName,
      path: s.path,
      schedule: s.schedule,
      requestMethod: s.method,
      periodMinutes,
      graceMinutes,
      nextDueAt,
      status,
      vercelConnectionId: scheduleConnectionId(prior, activeIds, input.connectionId),
      vercelProjectId: input.projectId,
      vercelScopeId: input.scopeId,
      vercelDeploymentId: input.deploymentId,
      lastEvidenceCheckedAt: changed ? null : prior?.lastEvidenceCheckedAt ?? null,
      evidenceState: changed ? null : prior?.evidenceState ?? null,
      missCount: changed ? 0 : prior?.missCount ?? 0,
      lastPingAt: changed ? null : prior?.lastPingAt ?? null,
      lastPingKind: changed ? null : prior?.lastPingKind ?? null,
      lastNote: shouldPause ? `${AUTO_NOTE} no production deployment, or the schedule was not understood` : restart ? null : prior.lastNote,
      updatedAt: new Date(),
    };
    await db.insert(schema.checkinJobs).values({ userId: input.userId, source: "vercel", externalRef, token: randomToken(18), ...values })
      .onConflictDoUpdate({ target: [schema.checkinJobs.userId, schema.checkinJobs.externalRef], set: values });
  }
  for (const j of existing) if (j.status !== "retired" && j.externalRef && !refs.has(j.externalRef)) {
    await db.update(schema.checkinJobs).set({ status: "paused", lastNote: `${AUTO_NOTE} schedule removed from the project`, updatedAt: new Date() }).where(eq(schema.checkinJobs.id, j.id));
  }
}

/** One request-history query per project, with up to three fallback credentials after a refusal. */
export async function sweepVercelSchedules(nowMs = Date.now()): Promise<{ checked: number; unavailable: number }> {
  const db = getDb();
  const jobs = await db.select().from(schema.checkinJobs).where(and(eq(schema.checkinJobs.source, "vercel"), inArray(schema.checkinJobs.status, ["up", "late", "down", "new"])));
  const connections = await db.select().from(schema.connections).where(and(eq(schema.connections.provider, "vercel"), eq(schema.connections.status, "active")));
  const groups = new Map<string, typeof jobs>();
  for (const job of jobs) {
    if (!job.vercelConnectionId || !job.vercelProjectId || !job.schedule || !job.path) continue;
    const key = `${job.userId}:${job.vercelProjectId}`;
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  let checked = 0;
  let unavailable = 0;
  for (const group of groups.values()) {
    const first = group[0];
    const scopeKey = first.vercelScopeId ?? "team:scoped";
    const scope: VercelScope = { kind: scopeKey.startsWith("user:") ? "user" : "team", id: scopeKey.slice(scopeKey.indexOf(":") + 1), slug: "", name: "" };
    const fromMs = Math.min(nowMs - 1, Math.max(nowMs - 2 * 60 * 60_000, Math.min(...group.map((j) => j.nextDueAt?.getTime() ?? nowMs - 10 * 60_000)) - 2 * 60_000));
    const paths = [...new Set(group.map((j) => j.path!.split("?")[0]))];
    const attempts: { id: string; result: HistoryResult }[] = [];
    const candidates = connections.filter((c) => c.userId === first.userId);
    let choice = historyChoice(first.vercelConnectionId!, candidates, attempts);
    while (choice.kind === "try") {
      const id = choice.id;
      let result: HistoryResult;
      try {
        const token = await getAccessToken(id);
        result = await queryRequestCounts(token, scope, first.vercelProjectId!, paths, fromMs, nowMs);
      } catch { result = { ok: false, reason: "unavailable" }; }
      attempts.push({ id, result });
      choice = historyChoice(first.vercelConnectionId!, candidates, attempts);
    }
    if (choice.kind === "ok") {
      for (const job of group) if (job.vercelConnectionId !== choice.id) {
        await db.update(schema.checkinJobs).set({ vercelConnectionId: choice.id, updatedAt: new Date(nowMs) }).where(eq(schema.checkinJobs.id, job.id));
      }
    }
    const result = attempts.at(-1)?.result ?? { ok: false as const, reason: "unavailable" as const };
    if (!result.ok) {
      unavailable++;
      for (const job of group) {
        // Refused: the job stops being judged on a schedule we cannot see and waits for a check-in.
        const silent = result.reason === "not_readable" && mustWaitForCheckIn(job);
        await db.update(schema.checkinJobs).set(silent
          // lastEvidenceCheckedAt marks this reset, so a check-in sent after it is recognised as the owner's.
          ? { evidenceState: result.reason, status: "new", nextDueAt: null, missCount: 0, lastEvidenceCheckedAt: new Date(nowMs), updatedAt: new Date(nowMs) }
          : { evidenceState: result.reason }).where(eq(schema.checkinJobs.id, job.id));
      }
      continue;
    }
    const evidence = result.evidence;
    for (const job of group) {
      // History just became readable (first read, or a token was added): start clean from the next run.
      if ((job.evidenceState && job.evidenceState !== "ok") || !job.nextDueAt) {
        const next = nextRun(job.schedule!, nowMs);
        await db.update(schema.checkinJobs).set({ nextDueAt: next === null ? null : new Date(next), lastEvidenceCheckedAt: new Date(nowMs), evidenceState: "ok", status: "up", missCount: 0, updatedAt: new Date(nowMs) }).where(eq(schema.checkinJobs.id, job.id));
        continue;
      }
      let cursor = job.nextDueAt!.getTime();
      if (cursor < nowMs - 6 * 60 * 60_000 + 2 * 60_000) {
        const safeDue = nextRun(job.schedule!, fromMs + 2 * 60_000 - 1);
        if (safeDue === null) continue;
        cursor = safeDue;
        await db.update(schema.checkinJobs).set({ nextDueAt: new Date(cursor), updatedAt: new Date(nowMs) }).where(eq(schema.checkinJobs.id, job.id));
      }
      const expected = expectedRuns(job.schedule!, cursor - 60_000, nowMs, 21);
      if (expected === null) continue;
      for (const decision of decideRuns(expected, evidence, job.path!, job.graceMinutes * 60_000, nowMs).slice(0, 20)) {
        if (decision.kind === "missed") await sweepQuietJobs(nowMs, [job.id]);
        else await recordPing(job.token, decision.kind, decision.kind === "fail" ? `HTTP ${decision.status}` : null, decision.atMs!);
        const next = nextRun(job.schedule!, decision.dueMs);
        await db.update(schema.checkinJobs).set({ nextDueAt: next === null ? null : new Date(next), updatedAt: new Date(nowMs) }).where(eq(schema.checkinJobs.id, job.id));
        checked++;
      }
      await db.update(schema.checkinJobs).set({ lastEvidenceCheckedAt: new Date(nowMs), evidenceState: "ok" }).where(eq(schema.checkinJobs.id, job.id));
    }
  }
  return { checked, unavailable };
}
