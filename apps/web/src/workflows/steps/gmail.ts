/**
 * Steps for the Gmail backfill. Each is idempotent: progress is written as
 * absolute values computed by the workflow, and messages upsert on
 * (connection_id, gmail_message_id). Only ids cross step boundaries; tokens are
 * read from the encrypted row inside each step.
 */
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { RetryableError } from "workflow";
import { start } from "workflow/api";
import { getDb, schema } from "@/db";
import { READ_AUTO_LIMIT, unreadCount } from "@/lib/reading";
import { readReceipts } from "@/workflows/read-receipts";
import { track } from "@/lib/analytics/server";
import { getAccessToken } from "@/lib/connections";
import { GmailRateLimited, getMessageMetadata, listMessageIds } from "@/lib/gmail/client";
import { toHeaderView, toMessageRow, type GmailMetadataMessage } from "@/lib/gmail/messages";
import { GMAIL_UNITS_PER_MESSAGE_GET, GMAIL_UNITS_PER_MESSAGE_LIST, gmailLimiter } from "@/lib/rate-limiter";
import { buildGmailQueries, classifyHeader } from "@/lib/tier0";

type Phase = "search" | "exhaustive" | "done";
const FETCH_CONCURRENCY = 10;

function rethrowRateLimit(err: unknown): never {
  if (err instanceof GmailRateLimited) {
    throw new RetryableError("gmail rate limited", { retryAfter: err.retryAfterSeconds * 1000 });
  }
  throw err;
}

export async function getSearchQueries() {
  "use step";
  return buildGmailQueries();
}

export async function setProgress(syncRunId: string, phase: Phase, scanned: number) {
  "use step";
  await getDb()
    .update(schema.syncRuns)
    .set({ phase, scanned, updatedAt: new Date() })
    .where(eq(schema.syncRuns.id, syncRunId));
}

/** Record how many messages the run expects to scan in all, so the UI can show an ETA. */
export async function setTotalEstimate(syncRunId: string, totalEstimate: number) {
  "use step";
  await getDb()
    .update(schema.syncRuns)
    .set({ totalEstimate: Math.max(0, Math.round(totalEstimate)), updatedAt: new Date() })
    .where(eq(schema.syncRuns.id, syncRunId));
}

export async function listPage(connectionId: string, q: string, pageToken?: string) {
  "use step";
  const token = await getAccessToken(connectionId);
  await gmailLimiter().take(GMAIL_UNITS_PER_MESSAGE_LIST);
  try {
    return await listMessageIds(token, q, pageToken);
  } catch (err) {
    rethrowRateLimit(err);
  }
}

/**
 * Fetch headers for up to 100 ids under the per-user rate limiter, keep the
 * candidates, upsert them, and write progress. Ids we already hold are skipped
 * in both modes to save quota. In "search" mode every hit is a candidate (the
 * query already filtered); in "exhaustive" mode each goes through classifyHeader.
 */
export async function fetchAndStore(input: {
  connectionId: string;
  syncRunId: string;
  ids: string[];
  mode: "search" | "exhaustive";
  reason: string;
  scannedAfter: number;
}) {
  "use step";
  const db = getDb();
  let ids = input.ids;
  if (ids.length) {
    const known = await db
      .select({ id: schema.messages.gmailMessageId })
      .from(schema.messages)
      .where(and(eq(schema.messages.connectionId, input.connectionId), inArray(schema.messages.gmailMessageId, ids)));
    const knownSet = new Set(known.map((k) => k.id));
    ids = ids.filter((id) => !knownSet.has(id));
  }

  const token = await getAccessToken(input.connectionId);
  const limiter = gmailLimiter();
  const fetched: GmailMetadataMessage[] = [];
  try {
    for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
      const slice = ids.slice(i, i + FETCH_CONCURRENCY);
      const got = await Promise.all(
        slice.map(async (id) => {
          await limiter.take(GMAIL_UNITS_PER_MESSAGE_GET);
          return getMessageMetadata(token, id);
        }),
      );
      for (const m of got) if (m) fetched.push(m);
    }
  } catch (err) {
    rethrowRateLimit(err);
  }

  // Both phases keep only what the header classifier accepts. A search hit is a
  // lead, not a verdict: Gmail's own categories and broad subject words pull in
  // shopping, shipping and brokerage mail that the classifier's consumer and
  // newsletter rules drop for free.
  const rows = fetched.flatMap((m) => {
    const verdict = classifyHeader(toHeaderView(m));
    return verdict.candidate ? [toMessageRow(m, input.connectionId, verdict.reason)] : [];
  });

  if (rows.length) {
    await db
      .insert(schema.messages)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.messages.connectionId, schema.messages.gmailMessageId],
        set: { labels: sqlExcluded("labels"), updatedAt: new Date() },
      });
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.messages)
    .where(eq(schema.messages.connectionId, input.connectionId));
  await db
    .update(schema.syncRuns)
    .set({ phase: input.mode, scanned: input.scannedAfter, candidates: n, updatedAt: new Date() })
    .where(eq(schema.syncRuns.id, input.syncRunId));

  return { fetched: fetched.length, kept: rows.length, candidates: n };
}

/**
 * Start the reading pipeline for this inbox (Tiers 1 to 3). Called after the
 * search phase so findings appear within minutes, and again after the full
 * scan. A run already in flight is fine: reading claims messages one by one.
 */
export async function startReading(connectionId: string) {
  "use step";
  const [c] = await getDb()
    .select({ userId: schema.connections.userId, status: schema.connections.status })
    .from(schema.connections)
    .where(eq(schema.connections.id, connectionId))
    .limit(1);
  if (!c || c.status !== "active") return null;
  // Big backlogs cost real money to read; they wait for the user's explicit Read.
  const unread = await unreadCount(connectionId);
  if (unread === 0 || unread > READ_AUTO_LIMIT) return null;
  const wf = await start(readReceipts, [{ connectionId, userId: c.userId }]);
  return wf.runId;
}

export async function finishRun(syncRunId: string, connectionId: string, scanned: number) {
  "use step";
  const db = getDb();
  const finishedAt = new Date();
  const [run] = await db
    .update(schema.syncRuns)
    .set({ phase: "done", scanned, finishedAt, updatedAt: finishedAt })
    .where(eq(schema.syncRuns.id, syncRunId))
    .returning();
  const [conn] = await db
    .update(schema.connections)
    .set({ lastSyncedAt: finishedAt })
    .where(eq(schema.connections.id, connectionId))
    .returning({ userId: schema.connections.userId });
  if (run && conn) {
    await track(conn.userId, "backfill_complete", {
      connection_id: connectionId,
      scanned,
      candidates: run.candidates,
      duration_ms: finishedAt.getTime() - run.startedAt.getTime(),
    });
  }
}

export async function failRun(syncRunId: string, message: string) {
  "use step";
  await getDb()
    .update(schema.syncRuns)
    .set({ error: message.slice(0, 300), finishedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.syncRuns.id, syncRunId));
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

// Rate limits are expected on large inboxes; give the I/O steps more room.
listPage.maxRetries = 8;
fetchAndStore.maxRetries = 8;
