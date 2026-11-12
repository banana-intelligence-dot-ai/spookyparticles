/**
 * Steps for the reading pipeline: Tier 0 candidates in, receipt rows out.
 * Each message is claimed (read_at set) before it is fetched, so two runs never
 * read the same one. Bodies live inside readBatch only: fetched, classified,
 * extracted, validated, dropped. Only ids cross step boundaries.
 */
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { RetryableError } from "workflow";
import { getDb, schema } from "@/db";
import { track } from "@/lib/analytics/server";
import { appendAudit } from "@/lib/audit";
import { getAccessToken } from "@/lib/connections";
import { classifySender, isRetryable } from "@/lib/extract/claude";
import { readEmail } from "@/lib/extract/read-email";
import { findSender } from "@spooky/tier0";
import { recomputeFindings } from "@/lib/findings";
import { GmailRateLimited, getMessageFull } from "@/lib/gmail/client";
import { templateFingerprint, toEmailText } from "@/lib/gmail/body";
import { assertModelBudget, ModelBudgetExceeded, recordModelUsage } from "@/lib/model-usage";
import { GMAIL_UNITS_PER_MESSAGE_GET, gmailLimiter } from "@/lib/rate-limiter";

export const READ_BATCH = 10;
/** Emails read at the same time inside one batch (model calls in flight). */
const READ_CONCURRENCY = 5;
const BUDGET_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

/** Verdicts that end the read for a sender: no per-email model call, no receipt. */
const NOT_A_VENDOR = new Set(["consumer", "finance", "shipping", "personal"]);

/**
 * One decision per sending domain (Tier 1, by sender). Known
 * vendors from the Tier 0 table never need it. Otherwise the cached verdict is
 * used, or Haiku decides once from up to eight subjects of this inbox's mail
 * from that domain, and the verdict is stored for everyone. Null means "could
 * not decide now"; the email then goes through the per-email path.
 */
async function senderVerdictFor(userId: string, connectionId: string, domain: string | null, fromAddress: string | null) {
  if (!domain) return null;
  if (fromAddress && findSender(fromAddress)) return { verdict: "software_vendor" as const, vendor: null, cached: true };
  const db = getDb();
  const [cached] = await db.select().from(schema.senderVerdicts).where(eq(schema.senderVerdicts.domain, domain)).limit(1);
  if (cached) return { verdict: cached.verdict, vendor: cached.vendor, cached: true };

  const sample = await db
    .select({ subject: schema.messages.subject })
    .from(schema.messages)
    .where(and(eq(schema.messages.connectionId, connectionId), sql`lower(${schema.messages.from}) like ${"%@" + domain + "%"}`))
    .limit(8);
  const subjects = sample.map((r) => r.subject).filter((x): x is string => Boolean(x));
  await assertModelBudget(userId);
  const r = await classifySender({ domain, subjects });
  if (r.usage) await recordModelUsage({ userId, connectionId, stage: "sender_verdict", usage: r.usage });
  if (!r.ok) {
    if (isRetryable(r.reason)) throw new RetryableError(r.reason, { retryAfter: 30_000 });
    return null;
  }
  await db
    .insert(schema.senderVerdicts)
    .values({ domain, verdict: r.value.verdict, vendor: r.value.vendor, confidence: r.value.confidence, model: r.usage.model, sampleSize: subjects.length })
    .onConflictDoNothing();
  return { verdict: r.value.verdict, vendor: r.value.vendor, cached: false };
}

/** Ids of candidate messages nobody has read yet, newest first (current spend first), for one inbox. */
export async function pendingMessageIds(connectionId: string, limit = 500): Promise<string[]> {
  "use step";
  const rows = await getDb()
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(and(eq(schema.messages.connectionId, connectionId), isNull(schema.messages.readAt)))
    .orderBy(desc(schema.messages.date))
    .limit(limit);
  return rows.map((r) => r.id);
}

export type ReadResult = { claimed: number; receipts: number; skipped: number; failed: number; retry: number };

/**
 * Read up to READ_BATCH messages: claim, fetch full, classify, extract when
 * worth it, validate, store. A model rate limit or Gmail limit marks the batch
 * retryable; other failures are written to messages.read_error and the pipeline
 * moves on.
 */
export async function readBatch(input: { connectionId: string; userId: string; ids: string[] }): Promise<ReadResult> {
  "use step";
  const db = getDb();
  const result: ReadResult = { claimed: 0, receipts: 0, skipped: 0, failed: 0, retry: 0 };
  if (!input.ids.length) return result;

  const pauseForBudget = async (cap: ModelBudgetExceeded["cap"]) => {
    await appendAudit({ actor: "system:reading", userId: input.userId, action: "model_budget.paused", target: `connection:${input.connectionId}`, after: { cap, retryAfterHours: 6 } });
    throw new RetryableError("model budget exceeded", { retryAfter: BUDGET_RETRY_AFTER_MS });
  };
  try {
    await assertModelBudget(input.userId);
  } catch (err) {
    if (err instanceof ModelBudgetExceeded) await pauseForBudget(err.cap);
    throw err;
  }

  // Claim: only rows still unread come back, so a second run gets nothing.
  const claimed = await db
    .update(schema.messages)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(schema.messages.id, input.ids), isNull(schema.messages.readAt)))
    .returning({ id: schema.messages.id, gmailMessageId: schema.messages.gmailMessageId });
  result.claimed = claimed.length;
  if (!claimed.length) return result;

  const token = await getAccessToken(input.connectionId);
  const limiter = gmailLimiter();
  let retryAfterMs: number | null = null;
  let budgetPaused: ModelBudgetExceeded["cap"] | null = null;

  const readOne = async (row: { id: string; gmailMessageId: string }) => {
    try {
      if (budgetPaused) {
        await unclaim(row.id);
        result.retry += 1;
        return;
      }
      await limiter.take(GMAIL_UNITS_PER_MESSAGE_GET);
      const full = await getMessageFull(token, row.gmailMessageId);
      if (!full) {
        await markRead(row.id, { readError: "message gone from Gmail" });
        result.skipped += 1;
        return;
      }
      const email = toEmailText(full);
      if (!email.text) {
        await markRead(row.id, { readError: "empty body" });
        result.skipped += 1;
        return;
      }

      // Tier 1 by sender: shops, banks, carriers and people end here, for free after the first time.
      const sender = await senderVerdictFor(input.userId, input.connectionId, email.fromDomain, email.fromAddress);
      if (budgetPaused) {
        await unclaim(row.id);
        result.retry += 1;
        return;
      }
      if (sender && NOT_A_VENDOR.has(sender.verdict)) {
        await markRead(row.id, { tier1Type: "other", tier1Vendor: sender.vendor ?? undefined, tier1Confidence: 1 });
        result.skipped += 1;
        return;
      }

      // Recipe first, then Tiers 2 and 3 with escalation. The extractor's type is the classification.
      const fingerprint = templateFingerprint(email.fromAddress, email.html, email.subject);
      const r = await readEmail(email, {
        fingerprint,
        beforeModelCall: () => assertModelBudget(input.userId),
        onModelUsage: (stage, usage) => recordModelUsage({ userId: input.userId, connectionId: input.connectionId, stage, usage }),
      });
      if (budgetPaused) {
        await unclaim(row.id);
        result.retry += 1;
        return;
      }
      if (!r.ok) {
        if (isRetryable(r.reason)) {
          await unclaim(row.id);
          retryAfterMs = Math.max(retryAfterMs ?? 0, 30_000);
          result.retry += 1;
          return;
        }
        await markRead(row.id, { readError: r.reason });
        result.failed += 1;
        return;
      }
      const { record: rec, validated: v } = r;
      await markRead(row.id, { tier1Type: rec.type, tier1Vendor: r.vendor, tier1Confidence: rec.confidence });
      // Everything but "other" is kept: bills as receipts, and notices (failed
      // deploys, usage limits, security alerts, deprecations) as the activity feed.
      if (rec.type === "other") {
        result.skipped += 1;
        return;
      }

      await db
        .insert(schema.receipts)
        .values({
          userId: input.userId,
          connectionId: input.connectionId,
          messageId: row.id,
          kind: rec.type,
          vendor: r.vendor,
          amountCents: v.amountCents,
          currency: v.currency,
          // Notices carry the email's date, so the activity feed is dated by when it happened.
          billedAt: v.billedAt ?? email.date,
          periodStart: v.periodStart,
          periodEnd: v.periodEnd,
          dueAt: v.dueAt,
          plan: r.plan,
          projectNames: rec.project_names.slice(0, 20),
          domainNames: rec.domain_names.slice(0, 20),
          accountEmail: rec.account_email,
          cardLast4: rec.card_last4 ? rec.card_last4.replace(/\D/g, "").slice(-4) || null : null,
          invoiceId: rec.invoice_id,
          status: rec.status,
          cadence: v.cadence,
          senderVerified: email.auth.verified,
          templateFingerprint: fingerprint,
          confidence: v.confidence,
          checks: v.checks,
          model: r.model,
          inputTokens: r.usage.reduce((n, u) => n + u.inputTokens, 0),
          outputTokens: r.usage.reduce((n, u) => n + u.outputTokens, 0),
        })
        .onConflictDoNothing({ target: schema.receipts.messageId });
      result.receipts += 1;
    } catch (err) {
      if (err instanceof ModelBudgetExceeded) {
        budgetPaused = err.cap;
        await unclaim(row.id);
        result.retry += 1;
        return;
      }
      if (err instanceof GmailRateLimited) {
        await unclaim(row.id);
        retryAfterMs = Math.max(retryAfterMs ?? 0, err.retryAfterSeconds * 1000);
        result.retry += 1;
        return;
      }
      if (err instanceof RetryableError) {
        await unclaim(row.id);
        retryAfterMs = Math.max(retryAfterMs ?? 0, 30_000);
        result.retry += 1;
        return;
      }
      console.error("[read] message failed", row.id, (err as Error).message);
      await markRead(row.id, { readError: (err as Error).message.slice(0, 120) });
      result.failed += 1;
    }
  };

  // A small pool: READ_CONCURRENCY emails in flight at once.
  const queue = [...claimed];
  await Promise.all(
    Array.from({ length: Math.min(READ_CONCURRENCY, queue.length) }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) await readOne(row);
    }),
  );

  if (budgetPaused) await pauseForBudget(budgetPaused);
  if (retryAfterMs !== null) {
    // Some messages were unclaimed; the workflow retries this step and picks them up.
    throw new RetryableError("rate limited while reading", { retryAfter: retryAfterMs });
  }
  return result;
}

async function markRead(
  id: string,
  set: { readError?: string; tier1Type?: string; tier1Vendor?: string; tier1Confidence?: number },
) {
  await getDb()
    .update(schema.messages)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(schema.messages.id, id));
}

async function unclaim(id: string) {
  await getDb().update(schema.messages).set({ readAt: null }).where(eq(schema.messages.id, id));
}

/** How far reading has got for one inbox: candidates read over candidates total. */
export async function readingProgress(connectionId: string): Promise<{ done: number; total: number }> {
  const [row] = await getDb()
    .select({
      total: count(),
      done: sql<number>`count(*) filter (where ${schema.messages.readAt} is not null)::int`,
    })
    .from(schema.messages)
    .where(eq(schema.messages.connectionId, connectionId));
  return { done: Number(row?.done ?? 0), total: Number(row?.total ?? 0) };
}

export async function finishReading(input: { connectionId: string; userId: string; totals: ReadResult }) {
  "use step";
  const r = await recomputeFindings(input.userId, "system:reading");
  await track(input.userId, "reading_complete", {
    connection_id: input.connectionId,
    receipts: input.totals.receipts,
    skipped: input.totals.skipped,
    failed: input.totals.failed,
    findings: r.findings,
    subscriptions: r.subscriptions,
  });
  return r;
}

readBatch.maxRetries = 12;
