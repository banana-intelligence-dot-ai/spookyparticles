import { and, eq, inArray, like, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { upsertEdge, upsertNode } from "@/lib/graph";
import { ApiError } from "@/lib/http";
import { BILLING_CALL, billByProject, type Bill, type BilledService, type ChargeRow } from "./billing";
import { SERVICE_CATALOG } from "./catalog";
import { chosenCost, mergeBilling, readCosts, recordCost } from "./cost";
import { billRows, cleanServiceInput, serviceRows } from "./model";


export async function syncProjectServices(userId: string, projectNodeId: string, keys: string[], at: string) {
  const db = getDb();
  const existing = await db.select({ id: schema.edges.id, toNodeId: schema.edges.toNodeId, provenance: schema.edges.provenance })
    .from(schema.edges).where(and(eq(schema.edges.userId, userId), eq(schema.edges.fromNodeId, projectNodeId), eq(schema.edges.kind, "uses")));
  const kept = new Set<string>();
  for (const key of keys) {
    const entry = SERVICE_CATALOG.find((s) => s.key === key);
    if (!entry) continue;
    const [prior] = await db.select({ id: schema.nodes.id, attributes: schema.nodes.attributes }).from(schema.nodes)
      .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "service"), eq(schema.nodes.externalKey, `service:${key}`))).limit(1);
    const serviceId = await upsertNode({ userId, kind: "service", externalKey: `service:${key}`, name: entry.name, attributes: { ...prior?.attributes, category: entry.category } });
    kept.add(serviceId);
    if (existing.some((e) => e.toNodeId === serviceId && e.provenance.source === "manual")) continue;
    await upsertEdge({ userId, fromNodeId: projectNodeId, toNodeId: serviceId, kind: "uses", confidence: 0.7, provenance: { source: "vercel", call: "GET /v10/projects env names", at } });
  }
  const stale = existing.filter((e) => e.provenance.source === "vercel" && e.provenance.call !== BILLING_CALL && !kept.has(e.toNodeId)).map((e) => e.id);
  if (stale.length) await db.delete(schema.edges).where(and(eq(schema.edges.userId, userId), inArray(schema.edges.id, stale)));
}

/** What one billing read found, kept on the Vercel account node so the list can say why a cost is unknown. */
export type AccountBilling = {
  /** other_account: Vercel answered with another account's bill (a user's default team), which that account already shows. */
  state: "read" | "not_readable" | "unavailable" | "other_account";
  from?: string; to?: string; at: string; unassigned?: Bill;
  /** What Vercel charged beyond the plan in the period (BilledCost). */
  chargedCents?: number;
};

/**
 * The whole bill for one scope, saved as a total per product on each of its project nodes
 * (a project with no charges in the period gets zero). Returns what Vercel tied to no known project.
 */
export async function syncProjectBills(userId: string, scopeId: string, rows: ChargeRow[], period: { from: string; to: string }, at: string): Promise<{ unassigned: Bill; chargedCents: number }> {
  const db = getDb();
  const projects = await db.select({ id: schema.nodes.id, externalKey: schema.nodes.externalKey, attributes: schema.nodes.attributes }).from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "project")));
  const inScope = projects.filter((p) => p.attributes.scope_id === scopeId && p.externalKey.startsWith("vercel:project:"));
  const vercelId = (p: { externalKey: string }) => p.externalKey.slice("vercel:project:".length);
  const bill = billByProject(rows, new Set(inScope.map(vercelId)));
  for (const p of inScope) {
    const vercel_bill = { ...(bill.projects[vercelId(p)] ?? { cents: 0, products: [] }), from: period.from, to: period.to, at };
    await db.update(schema.nodes).set({ attributes: sql`${schema.nodes.attributes} || ${JSON.stringify({ vercel_bill })}::jsonb` })
      .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.id, p.id)));
  }
  return { unassigned: bill.unassigned, chargedCents: bill.chargedCents };
}

/** A good read is kept this long against a later connection that cannot read billing for the same account. */
const BILLING_READ_HOLD_MS = 24 * 60 * 60_000;

export async function setAccountBilling(userId: string, accountNodeId: string, billing: AccountBilling) {
  if (billing.state === "not_readable" || billing.state === "unavailable") {
    // The integration and a pasted token can share one account node; the one that cannot read billing must not erase the one that can.
    const [node] = await getDb().select({ attributes: schema.nodes.attributes }).from(schema.nodes)
      .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.id, accountNodeId))).limit(1);
    const prior = node?.attributes.billing as AccountBilling | undefined;
    if (prior?.state === "read" && Date.parse(billing.at) - Date.parse(prior.at) < BILLING_READ_HOLD_MS) return;
  }
  await getDb().update(schema.nodes).set({ attributes: sql`${schema.nodes.attributes} || ${JSON.stringify({ billing })}::jsonb` })
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.id, accountNodeId)));
}

/**
 * One scope's billing read, saved: each outside seller's cost for the period on its service node,
 * a "uses" edge for each project Vercel tagged on the charge (never replacing an edge that is already
 * there), and this scope's share removed from services it no longer bills.
 */
export async function syncBilledServices(userId: string, scope: { key: string; id: string }, billed: BilledService[], period: { from: string; to: string }, at: string) {
  const db = getDb();
  const nowMs = Date.parse(at);
  const services = await db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "service")));
  const projects = await db.select({ id: schema.nodes.id, externalKey: schema.nodes.externalKey, attributes: schema.nodes.attributes }).from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "project")));
  const projectByVercelId = new Map(projects.map((p) => [p.externalKey.replace(/^vercel:project:/, ""), p.id]));
  const edges = await db.select().from(schema.edges).where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "uses")));
  const keptPairs = new Set<string>();
  const billedIds = new Set<string>();
  for (const b of billed) {
    const prior = services.find((n) => n.externalKey === `service:${b.key}`);
    const costs = mergeBilling(readCosts(prior?.attributes ?? {}, prior?.monthlyCostCents ?? null), scope.key, b.cents, period, at);
    const known = SERVICE_CATALOG.find((s) => s.key === b.key);
    const serviceId = await upsertNode({ userId, kind: "service", externalKey: `service:${b.key}`, name: prior?.name ?? b.name,
      attributes: { ...prior?.attributes, category: known?.category ?? (typeof prior?.attributes.category === "string" ? prior.attributes.category : b.category), costs } });
    billedIds.add(serviceId);
    await db.update(schema.nodes).set({ monthlyCostCents: chosenCost(costs, nowMs)?.cents ?? null, currency: "USD" }).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.id, serviceId)));
    for (const vercelId of b.projectIds) {
      const projectId = projectByVercelId.get(vercelId);
      if (!projectId) continue;
      keptPairs.add(`${projectId}>${serviceId}`);
      if (edges.some((e) => e.fromNodeId === projectId && e.toNodeId === serviceId)) continue;
      await upsertEdge({ userId, fromNodeId: projectId, toNodeId: serviceId, kind: "uses", confidence: 0.9, provenance: { source: "vercel", call: BILLING_CALL, at } });
    }
  }
  for (const n of services) {
    if (billedIds.has(n.id)) continue;
    const costs = readCosts(n.attributes, n.monthlyCostCents);
    if (!costs.vercel_billing?.scopes[scope.key]) continue;
    const next = mergeBilling(costs, scope.key, null, period, at);
    await db.update(schema.nodes).set({ attributes: { ...n.attributes, costs: next }, monthlyCostCents: chosenCost(next, nowMs)?.cents ?? null })
      .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.id, n.id)));
  }
  const inScope = new Set(projects.filter((p) => p.attributes.scope_id === scope.id).map((p) => p.id));
  const stale = edges.filter((e) => e.provenance.call === BILLING_CALL && inScope.has(e.fromNodeId) && !keptPairs.has(`${e.fromNodeId}>${e.toNodeId}`)).map((e) => e.id);
  if (stale.length) await db.delete(schema.edges).where(and(eq(schema.edges.userId, userId), inArray(schema.edges.id, stale)));
  return { services: billed.length };
}

export async function listServices(userId: string, nowMs = Date.now()) {
  const db = getDb();
  const [services, projects, edges, deployments, accounts] = await Promise.all([
    db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "service"))),
    db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "project"))),
    db.select().from(schema.edges).where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "uses"))),
    db.select({ externalKey: schema.nodes.externalKey, lastActivityAt: schema.nodes.lastActivityAt }).from(schema.nodes)
      .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "deployment"), like(schema.nodes.externalKey, "vercel:deployment:%:production"))),
    db.select({ name: schema.nodes.name, externalKey: schema.nodes.externalKey, attributes: schema.nodes.attributes }).from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "provider_account"))),
  ]);
  const productionAt = new Map(deployments.map((d) => [d.externalKey.slice("vercel:deployment:".length, -":production".length), d.lastActivityAt?.toISOString() ?? null]));
  const billingReadable = accounts.some((a) => (a.attributes.billing as AccountBilling | undefined)?.state === "read");
  return { ...serviceRows(services, projects, edges, { productionAt, billingReadable, nowMs }), bill: billRows(projects, accounts) };
}

export async function recordService(actor: Actor, input: unknown) {
  let clean: ReturnType<typeof cleanServiceInput>;
  try { clean = cleanServiceInput(input); } catch (err) { throw new ApiError(400, "invalid_service", (err as Error).message); }
  const db = getDb();
  const projects = await db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, actor.userId), eq(schema.nodes.kind, "project")));
  let matches = projects.filter((p) => {
    const scope = typeof p.attributes.scope_slug === "string" ? p.attributes.scope_slug : null;
    return p.name.toLowerCase() === clean.project.toLowerCase() || (scope && `${scope}/${p.name}`.toLowerCase() === clean.project.toLowerCase());
  });
  if (!matches.length) {
    const [repo] = await db.select({ id: schema.nodes.id }).from(schema.nodes)
      .where(and(eq(schema.nodes.userId, actor.userId), eq(schema.nodes.kind, "repo"), eq(schema.nodes.name, clean.project))).limit(1);
    if (repo) {
      const hosted = await db.select({ projectId: schema.edges.toNodeId }).from(schema.edges)
        .where(and(eq(schema.edges.userId, actor.userId), eq(schema.edges.kind, "hosted_on"), eq(schema.edges.fromNodeId, repo.id)));
      matches = projects.filter((p) => hosted.some((edge) => edge.projectId === p.id));
    }
  }
  if (matches.length !== 1) throw new ApiError(matches.length ? 409 : 404, "project_not_found", matches.length ? "Use the full scope/project name" : "Unknown Vercel project");
  const project = matches[0];
  const externalKey = `service:${clean.key}`;
  const [prior] = await db.select({ attributes: schema.nodes.attributes }).from(schema.nodes)
    .where(and(eq(schema.nodes.userId, actor.userId), eq(schema.nodes.kind, "service"), eq(schema.nodes.externalKey, externalKey))).limit(1);
  const serviceId = await upsertNode({ userId: actor.userId, kind: "service", externalKey, name: clean.name,
    attributes: { ...prior?.attributes, category: clean.category, ...(clean.note !== null ? { note: clean.note } : {}) } });
  if (clean.monthlyCostCents !== null) {
    // A signed-in person and an API key are kept apart, so an agent never overwrites what the person said.
    const [node] = await db.select({ attributes: schema.nodes.attributes, monthlyCostCents: schema.nodes.monthlyCostCents }).from(schema.nodes)
      .where(and(eq(schema.nodes.userId, actor.userId), eq(schema.nodes.id, serviceId))).limit(1);
    const now = new Date();
    const costs = recordCost(readCosts(node?.attributes ?? {}, node?.monthlyCostCents ?? null), actor.via === "session" ? "you" : "agent", clean.monthlyCostCents, now.toISOString());
    await db.update(schema.nodes).set({ attributes: { ...node?.attributes, costs }, monthlyCostCents: chosenCost(costs, now.getTime())?.cents ?? null, currency: "USD" })
      .where(and(eq(schema.nodes.userId, actor.userId), eq(schema.nodes.id, serviceId)));
  }
  await upsertEdge({ userId: actor.userId, fromNodeId: project.id, toNodeId: serviceId, kind: "uses", confidence: 1, provenance: { source: "manual", at: new Date().toISOString() } });
  await appendAudit({ userId: actor.userId, actor: actor.label, action: "service.recorded", target: `service:${serviceId}`, after: { projectId: project.id, serviceId } });
  return { serviceId, projectId: project.id };
}
