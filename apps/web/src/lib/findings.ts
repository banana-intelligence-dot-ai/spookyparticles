/**
 * Recompute a user's findings from receipts and the graph. Idempotent: findings
 * upsert on (user, key); open findings the rules no longer produce are removed;
 * confirmed and dismissed ones keep their status. Also writes one
 * `subscription` node per recurring charge so the Map shows what is paid for.
 */
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { isOwnMail } from "@spooky/tier0";
import { getDb, schema } from "@/db";
import { appendAudit } from "./audit";
import { billingUrl, computeFindings, findingVendor, matchRepo, type FindingCandidate } from "./findings-rules";
import { upsertEdge, upsertNode } from "./graph";
import { resolveVendorScopes } from "./extract/vendor-scope";
import { buildSpend, type SpendReport } from "./spend";

/** Sender verdicts that mean "not a software vendor": their receipts never count. */
const NOT_VENDOR_VERDICTS = ["consumer", "finance", "shipping", "personal"] as const;

/**
 * Receipts joined with the inbox address and the email subject, for spend and
 * evidence. Receipts from senders later judged consumer, finance, shipping or
 * personal are left out, so a verdict cleans up history as well as the future.
 */
export async function loadReceipts(userId: string) {
  const rows = await getDb()
    .select({
      receipt: schema.receipts,
      inbox: schema.connections.display,
      subject: schema.messages.subject,
      sentAt: schema.messages.date,
      from: schema.messages.from,
      senderVerdict: schema.senderVerdicts.verdict,
    })
    .from(schema.receipts)
    .innerJoin(schema.connections, eq(schema.connections.id, schema.receipts.connectionId))
    .innerJoin(schema.messages, eq(schema.messages.id, schema.receipts.messageId))
    .leftJoin(schema.senderVerdicts, eq(schema.senderVerdicts.domain, sql`lower(substring(${schema.messages.from} from '@([A-Za-z0-9.-]+)'))`))
    // An inbox Google signed out (errored) keeps its history; only a removed (revoked) one hides it.
    .where(and(eq(schema.receipts.userId, userId), ne(schema.connections.status, "revoked")));
  return rows
    .filter((r) => !r.senderVerdict || !(NOT_VENDOR_VERDICTS as readonly string[]).includes(r.senderVerdict))
    // Our own alerts read back in before the filter skipped them: never a vendor's signal.
    .filter((r) => !isOwnMail(r.from ?? undefined))
    .map((r) => ({ ...r.receipt, inbox: r.inbox, subject: r.subject, sentAt: r.sentAt }));
}

export type LoadedReceipt = Awaited<ReturnType<typeof loadReceipts>>[number];

/** Spend with every vendor placed as work, personal or unknown (cached verdicts, one cheap call for new vendors). */
export async function spendFor(userId: string, nowMs?: number, receipts?: LoadedReceipt[]): Promise<SpendReport> {
  const rows = receipts ?? (await loadReceipts(userId));
  const scopes = await resolveVendorScopes(rows);
  // The user's own calls win over the shared verdicts.
  const overrides = await getDb()
    .select({ vendorKey: schema.vendorScopeOverrides.vendorKey, scope: schema.vendorScopeOverrides.scope })
    .from(schema.vendorScopeOverrides)
    .where(eq(schema.vendorScopeOverrides.userId, userId));
  for (const o of overrides) scopes.set(o.vendorKey, o.scope);
  return buildSpend(rows, { nowMs, scopes });
}

/** Record the user's call on a vendor and recompute findings, which count work only. */
export async function setVendorScope(userId: string, vendorKey: string, scope: "work" | "personal", actor: string) {
  const db = getDb();
  const [before] = await db
    .select({ scope: schema.vendorScopeOverrides.scope })
    .from(schema.vendorScopeOverrides)
    .where(and(eq(schema.vendorScopeOverrides.userId, userId), eq(schema.vendorScopeOverrides.vendorKey, vendorKey)))
    .limit(1);
  await db
    .insert(schema.vendorScopeOverrides)
    .values({ userId, vendorKey, scope })
    .onConflictDoUpdate({ target: [schema.vendorScopeOverrides.userId, schema.vendorScopeOverrides.vendorKey], set: { scope, updatedAt: new Date() } });
  await appendAudit({
    actor,
    userId,
    action: "vendor.scope",
    target: `vendor:${vendorKey}`,
    before: { scope: before?.scope ?? null },
    after: { scope },
  });
  await recomputeFindings(userId, actor);
  return { vendorKey, scope };
}

export async function recomputeFindings(userId: string, actor = "system:findings"): Promise<{ findings: number; subscriptions: number }> {
  const db = getDb();
  const receipts = await loadReceipts(userId);
  const spend = await spendFor(userId, undefined, receipts);
  const [repoRows, deployEdges, deployNodes] = await Promise.all([
    db.select({ id: schema.nodes.id, name: schema.nodes.name, status: schema.nodes.status, lastActivityAt: schema.nodes.lastActivityAt })
      .from(schema.nodes)
      .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo"))),
    db.select({ fromNodeId: schema.edges.fromNodeId, toNodeId: schema.edges.toNodeId }).from(schema.edges)
      .where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "deploys"))),
    db.select({ id: schema.nodes.id, status: schema.nodes.status, attributes: schema.nodes.attributes, lastActivityAt: schema.nodes.lastActivityAt }).from(schema.nodes)
      .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "deployment"), eq(schema.nodes.status, "success"))),
  ]);
  // A repo's newest successful production deploy, so a site still deploying is never called a zombie.
  const prodAt = new Map(deployNodes
    .filter((d) => String((d.attributes as Record<string, unknown>).environment ?? "").toLowerCase() === "production" && d.lastActivityAt)
    .map((d) => [d.id, d.lastActivityAt as Date]));
  const repos = repoRows.map((r) => {
    const times = deployEdges.filter((e) => e.fromNodeId === r.id).map((e) => prodAt.get(e.toNodeId)).filter((t): t is Date => Boolean(t));
    return { ...r, lastDeployAt: times.length ? new Date(Math.max(...times.map((t) => t.getTime()))) : null };
  });

  // Subscription nodes: one per recurring charge, keyed like the subscription,
  // and a pays_for edge to the repo its project name matches.
  for (const s of spend.subscriptions) {
    const nodeId = await upsertNode({
      userId,
      kind: "subscription",
      externalKey: `receipt:${s.id}`,
      name: s.plan ? `${s.vendor} ${s.plan}` : s.vendor,
      attributes: {
        vendor: s.vendor,
        plan: s.plan,
        scope: s.scope,
        inbox: s.inbox,
        inboxes: s.inboxes,
        cadence: s.cadence,
        monthly_cost_cents: s.monthlyCents,
        currency: s.currency,
        receipts: s.receipts,
        project_names: s.projectNames,
      },
      status: s.monthlyCents === null ? "lapsed" : "active",
      lastActivityAt: new Date(s.lastBilledAt),
    });
    for (const project of s.projectNames) {
      const repo = matchRepo(project, repos);
      if (!repo) continue;
      await upsertEdge({
        userId,
        fromNodeId: nodeId,
        toNodeId: repo.id,
        kind: "pays_for",
        confidence: 0.8,
        provenance: { source: "gmail", call: `receipts naming "${project}"`, at: new Date().toISOString() },
      });
      break;
    }
  }

  // Subscription nodes the new grouping no longer produces are gone.
  const keep = spend.subscriptions.map((s) => `receipt:${s.id}`);
  await db
    .delete(schema.nodes)
    .where(
      and(
        eq(schema.nodes.userId, userId),
        eq(schema.nodes.kind, "subscription"),
        keep.length ? notInArray(schema.nodes.externalKey, keep) : undefined,
      ),
    );

  const candidates = computeFindings({ subscriptions: spend.subscriptions, receipts, repos });
  const keys = candidates.map((c) => c.key);

  for (const c of candidates) await upsertFinding(userId, c);

  // Open findings that the rules no longer produce are gone; verdicts stay.
  const stale = await db
    .select({ id: schema.findings.id, key: schema.findings.key })
    .from(schema.findings)
    .where(
      and(
        eq(schema.findings.userId, userId),
        eq(schema.findings.status, "open"),
        keys.length ? notInArray(schema.findings.key, keys) : undefined,
      ),
    );
  if (stale.length) {
    await db.delete(schema.findings).where(inArray(schema.findings.id, stale.map((s) => s.id)));
  }

  await appendAudit({
    actor,
    userId,
    action: "findings.recomputed",
    target: `user:${userId}`,
    after: { findings: candidates.length, removed: stale.length, subscriptions: spend.subscriptions.length, monthlyCents: spend.monthlyCents },
  });
  return { findings: candidates.length, subscriptions: spend.subscriptions.length };
}

async function upsertFinding(userId: string, c: FindingCandidate) {
  const values = {
    userId,
    kind: c.kind,
    key: c.key,
    title: c.title,
    action: c.action,
    amountCents: c.amountCents,
    currency: c.currency,
    nodeIds: c.nodeIds,
    evidence: c.evidence,
    confidence: c.confidence,
    computedAt: new Date(),
    updatedAt: new Date(),
  };
  await getDb()
    .insert(schema.findings)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.findings.userId, schema.findings.key],
      // Status is the user's; everything else is ours to refresh.
      set: { ...values },
    });
}

export function publicFinding(f: typeof schema.findings.$inferSelect) {
  return {
    id: f.id,
    kind: f.kind,
    title: f.title,
    action: f.action,
    amountCents: f.amountCents,
    currency: f.currency,
    confidence: f.confidence,
    status: f.status,
    evidence: f.evidence,
    actionUrl: billingUrl(findingVendor(f)),
    nodeIds: f.nodeIds,
    computedAt: f.computedAt,
    updatedAt: f.updatedAt,
  };
}
