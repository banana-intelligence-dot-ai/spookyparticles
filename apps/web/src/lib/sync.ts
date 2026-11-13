/** Start a sync for a connection: Gmail backfill, GitHub inventory or Vercel inventory. */
import { and, desc, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";
import { start } from "workflow/api";
import { getDb, schema } from "@/db";
import type { Connection } from "@/db/schema";
import { backfillGmail } from "@/workflows/backfill-gmail";
import { githubInventory } from "@/workflows/github-inventory";
import { vercelInventory } from "@/workflows/vercel-inventory";
import { appendAudit } from "./audit";
import { ApiError } from "./http";

/** A run that has not written progress for this long is treated as dead. */
const STALE_MS = 15 * 60 * 1000;
/** A mail re-read starts this far before the last finished read began, so nothing slips between. */
const MAIL_OVERLAP_MS = 24 * 60 * 60 * 1000;
/** Mail is re-read on its own about once a day. */
const MAIL_REREAD_MS = 20 * 60 * 60 * 1000;

/** Pure: where a mail re-read starts. Null (a full read) when no read ever finished cleanly. */
export function mailSince(lastCleanStart: Date | null): string | null {
  return lastCleanStart ? new Date(lastCleanStart.getTime() - MAIL_OVERLAP_MS).toISOString() : null;
}

/** Pure: an inbox is due a re-read when it is active and nothing was started for it in 20 hours. */
export function mailDue(status: string, lastStart: Date | null, nowMs: number): boolean {
  return status === "active" && (!lastStart || nowMs - lastStart.getTime() >= MAIL_REREAD_MS);
}

export async function startSync(c: Connection, actor: string) {
  if (c.status !== "active") throw new ApiError(409, "connection_inactive", "Connection is not active");
  if (c.provider !== "gmail" && c.provider !== "github" && c.provider !== "vercel") {
    throw new ApiError(400, "sync_unsupported", `Sync is not available for ${c.provider} yet`);
  }
  const db = getDb();
  const [running] = await db
    .select()
    .from(schema.syncRuns)
    .where(and(eq(schema.syncRuns.connectionId, c.id), isNull(schema.syncRuns.finishedAt)))
    .orderBy(desc(schema.syncRuns.startedAt))
    .limit(1);
  if (running && Date.now() - running.updatedAt.getTime() < STALE_MS) {
    throw new ApiError(409, "sync_running", "A sync is already running for this connection");
  }

  // GitHub: a run that paused at the rate limit left a cursor; continue after it.
  let resumeAfterRepoId: number | null = null;
  if (c.provider === "github") {
    const [last] = await db
      .select()
      .from(schema.syncRuns)
      .where(eq(schema.syncRuns.connectionId, c.id))
      .orderBy(desc(schema.syncRuns.startedAt))
      .limit(1);
    if (last?.cursor && last.finishedAt && last.phase !== "done" && /^\d+$/.test(last.cursor)) {
      resumeAfterRepoId = Number(last.cursor);
    }
  }

  // Gmail: after one clean full read, every later read covers only new mail.
  let since: string | null = null;
  if (c.provider === "gmail") {
    const [clean] = await db
      .select({ startedAt: schema.syncRuns.startedAt })
      .from(schema.syncRuns)
      .where(and(eq(schema.syncRuns.connectionId, c.id), eq(schema.syncRuns.phase, "done"), isNull(schema.syncRuns.error), isNotNull(schema.syncRuns.finishedAt)))
      .orderBy(desc(schema.syncRuns.startedAt))
      .limit(1);
    since = mailSince(clean?.startedAt ?? null);
  }

  const [run] = await db.insert(schema.syncRuns).values({ connectionId: c.id }).returning();
  const wf =
    c.provider === "gmail"
      ? await start(backfillGmail, [{ connectionId: c.id, syncRunId: run.id, ...(since ? { since } : {}) }])
      : c.provider === "vercel"
        ? await start(vercelInventory, [{ connectionId: c.id, syncRunId: run.id, billing: actor !== "system:watch" || new Date().getUTCMinutes() < 5 }])
        : await start(githubInventory, [{ connectionId: c.id, syncRunId: run.id, resumeAfterRepoId }]);
  await db.update(schema.syncRuns).set({ workflowRunId: wf.runId }).where(eq(schema.syncRuns.id, run.id));
  await appendAudit({
    actor,
    userId: c.userId,
    action: "connection.sync_started",
    target: `connection:${c.id}`,
    after: { syncRunId: run.id, workflowRunId: wf.runId, ...(resumeAfterRepoId ? { resumeAfterRepoId } : {}), ...(since ? { since } : {}) },
  });
  return { syncRunId: run.id, workflowRunId: wf.runId };
}

/** Hosts are re-read this often while someone (a person or their agent) is looking, or by the cron. */
const HOST_RESYNC_MS = 5 * 60_000;
/** GitHub repos: slower, since a run costs API calls and workflow steps per repo. Failed deploys come from Vercel, every 5 minutes. */
const GITHUB_RESYNC_MS = 30 * 60_000;
const lastHostKick = new Map<string, number>();

/**
 * Keep host connections fresh without a scheduler: any read of the map kicks a Vercel
 * resync for each active connection whose last sync is older than HOST_RESYNC_MS, at most
 * once per interval per connection per server instance. Failures are logged, never raised:
 * a read must not fail because a resync could not start.
 */
export async function resyncHostsQuietly(connections: Connection[]) {
  const now = Date.now();
  for (const c of connections) {
    if ((c.provider !== "vercel" && c.provider !== "github") || c.status !== "active") continue;
    const last = lastHostKick.get(c.id) ?? c.lastSyncedAt?.getTime() ?? 0;
    if (now - last < (c.provider === "github" ? GITHUB_RESYNC_MS : HOST_RESYNC_MS)) continue;
    lastHostKick.set(c.id, now);
    try {
      await startSync(c, "system:watch");
    } catch (err) {
      // A sync already running is the usual reason; anything else is logged by message only.
      if (!(err instanceof ApiError && err.code === "sync_running")) console.error("[watch] vercel resync did not start", c.id, (err as Error).message);
    }
  }
}

/** The same, for everything a user has connected: called from reads that only know the user. */
export async function resyncHostsQuietlyFor(userId: string) {
  const rows = await getDb()
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.userId, userId), inArray(schema.connections.provider, ["vercel", "github"]), eq(schema.connections.status, "active")));
  await resyncHostsQuietly(rows);
}

/**
 * Once a day per inbox, read the mail that arrived since the last read. Called by the watch
 * cron every five minutes; the 20-hour gate counts any started run, so a failing inbox is
 * retried tomorrow, not every five minutes. An expired Google sign-in marks the inbox as
 * needing attention, which ends the retries until the owner reconnects.
 */
export async function rereadMailDaily(nowMs = Date.now()): Promise<{ started: number }> {
  const db = getDb();
  const inboxes = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.provider, "gmail"), eq(schema.connections.status, "active")));
  if (!inboxes.length) return { started: 0 };
  const lastRuns = await db
    .select({ id: schema.syncRuns.connectionId, at: max(schema.syncRuns.startedAt) })
    .from(schema.syncRuns)
    .where(inArray(schema.syncRuns.connectionId, inboxes.map((c) => c.id)))
    .groupBy(schema.syncRuns.connectionId);
  const last = new Map(lastRuns.map((r) => [r.id, r.at ? new Date(r.at) : null]));
  let started = 0;
  for (const c of inboxes) {
    if (!mailDue(c.status, last.get(c.id) ?? null, nowMs)) continue;
    try {
      await startSync(c, "system:watch");
      started += 1;
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "sync_running")) console.error("[watch] mail re-read did not start", c.id, (err as Error).message);
    }
  }
  return { started };
}
