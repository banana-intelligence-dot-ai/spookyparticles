import { cleanNote } from "@/lib/checks/handoff";
import { BILLING_CALL } from "./billing";
import { serviceForName } from "./catalog";
import { chosenCost, readCosts, unknownCostNote } from "./cost";
import { shareOpportunities } from "./share";
import { IDLE_AFTER_DAYS, serviceUsage, type ProjectFacts } from "./usage";

export function cleanServiceInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Give a project and service");
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["project", "service", "monthlyCostUsd", "note"].includes(key))) throw new Error("Unexpected field");
  if (typeof data.project !== "string" || !data.project.trim() || data.project.trim().length > 120) throw new Error("project must be 1 to 120 characters");
  if (typeof data.service !== "string" || !data.service.trim() || data.service.trim().length > 80) throw new Error("service must be 1 to 80 characters");
  const project = data.project.trim();
  const rawService = data.service.trim();
  const known = serviceForName(rawService);
  if (!known && !/^[A-Za-z][A-Za-z0-9 .&+-]{0,79}$/.test(rawService)) throw new Error("service must be a plain name");
  const key = known?.key ?? rawService.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = known?.name ?? rawService;
  const category = known?.category ?? "other";
  const cost = data.monthlyCostUsd;
  if (cost !== undefined && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > 1_000_000 || Math.abs(Math.round(cost * 100) - cost * 100) > 1e-6)) throw new Error("monthlyCostUsd must be a nonnegative dollar amount with cents");
  return { project, key, name, category, monthlyCostCents: cost === undefined ? null : Math.round((cost as number) * 100), note: cleanNote(data.note) };
}

type ServiceNode = { id: string; name: string; externalKey: string; attributes: Record<string, unknown>; monthlyCostCents: number | null };
type ProjectNode = { id: string; name: string; externalKey?: string; status?: string | null; attributes: Record<string, unknown> };
type UseEdge = { fromNodeId: string; toNodeId: string; provenance: { source: string; call?: string }; lastSeenAt: Date };
type Context = { productionAt: Map<string, string | null>; billingReadable: boolean; nowMs: number };

export const SERVICE_RULES = {
  inUse: `In use: a project that depends on it had a production deploy or requests in the last ${IDLE_AFTER_DAYS} days. Idle: every such project is paused, or has had neither for ${IDLE_AFTER_DAYS} days. Unknown: an older deploy may still get requests and request history cannot be read. Requests come from Vercel's request history, read only with a pasted token.`,
  cost: "Monthly cost, from Vercel billing for the last 30 days when a Marketplace seller bills it, else what you recorded, else what your agent recorded. Never estimated.",
  bill: "Everything on your Vercel bill for the last 30 days, Vercel's own charges and Marketplace sellers', as a total per project and per product. Cost is Vercel's effective cost: the plan fee is spread over its days and usage your plan's included credit covered still counts. Charged is what Vercel billed beyond the plan. Charges Vercel ties to no project, such as the plan fee, are listed per account. Read only with a pasted token whose role may see billing.",
  share: "Where two projects each use a different service of the same kind. A suggestion only; nothing is changed.",
};

const projectLabel = (p: ProjectNode) => {
  const scope = typeof p.attributes.scope_slug === "string" ? p.attributes.scope_slug : null;
  return scope ? `${scope}/${p.name}` : p.name;
};

function factsOf(p: ProjectNode, ctx: Context): ProjectFacts {
  const vercelId = p.externalKey?.replace(/^vercel:project:/, "") ?? "";
  const traffic = p.attributes.errorRate && typeof p.attributes.errorRate === "object" ? p.attributes.errorRate as Record<string, unknown> : null;
  return {
    project: projectLabel(p),
    paused: p.attributes.paused === true || p.status === "paused",
    productionAt: ctx.productionAt.get(vercelId) ?? null,
    lastTrafficAt: typeof traffic?.lastTrafficAt === "string" ? traffic.lastTrafficAt : null,
    trafficReadSince: typeof traffic?.readSince === "string" ? traffic.readSince : null,
  };
}

export function serviceRows(services: ServiceNode[], projects: ProjectNode[], edges: UseEdge[], ctx: Context) {
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const rows = services.flatMap((service) => {
    const uses = edges.filter((e) => e.toNodeId === service.id && projectsById.has(e.fromNodeId));
    if (!uses.length) return [];
    const using = [...new Map(uses.map((e) => [e.fromNodeId, projectsById.get(e.fromNodeId)!])).values()];
    const names = using.map(projectLabel).sort();
    const cost = chosenCost(readCosts(service.attributes, service.monthlyCostCents), ctx.nowMs);
    return [{ id: service.id, key: service.externalKey.replace(/^service:/, ""), name: service.name,
      category: typeof service.attributes.category === "string" ? service.attributes.category : "other",
      projects: names,
      sources: [...new Set(uses.map((e) => (e.provenance.source === "vercel" && e.provenance.call === BILLING_CALL ? "vercel_billing" : e.provenance.source)))].sort(),
      monthlyCostUsd: cost ? cost.cents / 100 : null,
      costSource: cost?.source ?? null,
      costNote: cost?.note ?? unknownCostNote(ctx.billingReadable),
      usage: serviceUsage(using.map((p) => factsOf(p, ctx)), ctx.nowMs),
      lastSeenAt: new Date(Math.max(...uses.map((e) => e.lastSeenAt.getTime()))).toISOString(), shared: names.length >= 2 }];
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { services: rows, shares: shareOpportunities(rows), rules: SERVICE_RULES };
}

type BillShape = { cents: number; products: { name: string; cents: number }[] };
type AccountNode = { name: string; externalKey: string; attributes: Record<string, unknown> };

function readBill(v: unknown): BillShape | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  if (typeof b.cents !== "number" || !Array.isArray(b.products)) return null;
  const products = b.products.filter((l): l is { name: string; cents: number } => Boolean(l) && typeof l.name === "string" && typeof l.cents === "number");
  return { cents: b.cents, products };
}

const usd = (cents: number) => cents / 100;
const asLines = (b: BillShape) => b.products.map((l) => ({ name: l.name, usd: usd(l.cents) }));

/**
 * The whole Vercel bill per account, each project's total and products, from the last good billing read.
 * A project's bill shows only when it came from that same read, so a stale one never mixes in.
 */
export function billRows(projects: ProjectNode[], accounts: AccountNode[]) {
  const rows = accounts.flatMap((a) => {
    const billing = a.attributes.billing as { state?: string; from?: string; to?: string; unassigned?: unknown; chargedCents?: unknown } | undefined;
    if (billing?.state !== "read" || !billing.from || !billing.to || !a.externalKey.startsWith("vercel:account:")) return [];
    const scopeId = a.externalKey.slice("vercel:account:".length);
    const unassigned = readBill(billing.unassigned) ?? { cents: 0, products: [] };
    const projectBills = projects.flatMap((p) => {
      if (p.attributes.scope_id !== scopeId) return [];
      const raw = p.attributes.vercel_bill as Record<string, unknown> | undefined;
      const bill = readBill(raw);
      return bill && raw?.from === billing.from ? [{ project: projectLabel(p), usd: usd(bill.cents), products: asLines(bill) }] : [];
    }).sort((x, y) => y.usd - x.usd || x.project.localeCompare(y.project));
    const totalCents = projectBills.reduce((sum, p) => sum + Math.round(p.usd * 100), 0) + unassigned.cents;
    const chargedUsd = typeof billing.chargedCents === "number" && Number.isFinite(billing.chargedCents) ? usd(billing.chargedCents) : null;
    return [{ account: a.name, from: billing.from, to: billing.to, totalUsd: usd(totalCents), chargedUsd, projects: projectBills, unassigned: { usd: usd(unassigned.cents), products: asLines(unassigned) } }];
  }).sort((x, y) => y.totalUsd - x.totalUsd || x.account.localeCompare(y.account));
  return { accounts: rows, rule: SERVICE_RULES.bill };
}
