/**
 * Vercel billing charges (FOCUS v1.3 rows from GET /v1/billing/charges), read two ways:
 * a monthly cost per outside service (only rows sold by someone other than Vercel, such as
 * Neon or Upstash), and the whole bill as a total per project and per product, Vercel's own included.
 */
import { SERVICE_CATALOG, serviceForName } from "./catalog";

/** The provenance call on a "uses" edge found in Vercel billing, so the settings sync never deletes it as stale. */
export const BILLING_CALL = "GET /v1/billing/charges";

export type ChargeRow = Record<string, unknown>;
export type BilledService = { key: string; name: string; category: string; cents: number; projectIds: string[] };

/** FOCUS service categories, in the words the catalog uses. */
const CATEGORY: Record<string, string> = {
  "AI and Machine Learning": "ai", Analytics: "analytics", Databases: "database", Storage: "storage",
  Identity: "auth", Security: "security", "Management and Governance": "monitoring", Media: "media",
  "Developer Tools": "developer tools", Integration: "integration", Networking: "networking", Web: "web",
};

/** Catalog rows that are Vercel's own products or too generic to match a seller's name. */
const NOT_A_SELLER = new Set(["vercel-blob", "kv", "ai-gateway", "postgresql", "database", "google", "github"]);

/** A catalog seller named by the text, exactly or as its first word ("Neon", "Neon Postgres", "Upstash Inc."). */
function catalogSeller(text: string) {
  const lower = text.toLowerCase();
  const exact = serviceForName(text);
  if (exact && !NOT_A_SELLER.has(exact.key)) return exact;
  return SERVICE_CATALOG.find((s) => !NOT_A_SELLER.has(s.key) && lower.startsWith(`${s.name.toLowerCase()} `)) ?? null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Which outside service a charge row belongs to, or null when it is Vercel's own. */
export function sellerOf(row: ChargeRow): { key: string; name: string; category: string } | null {
  const provider = typeof row.ServiceProviderName === "string" ? row.ServiceProviderName.trim() : "";
  const service = typeof row.ServiceName === "string" ? row.ServiceName.trim() : "";
  const category = typeof row.ServiceCategory === "string" ? CATEGORY[row.ServiceCategory] ?? "other" : "other";
  if (provider && provider.toLowerCase() !== "vercel") {
    const known = catalogSeller(provider);
    if (known) return { key: known.key, name: known.name, category: known.category };
    if (!/^[A-Za-z][A-Za-z0-9 .&+-]{0,79}$/.test(provider) || !slug(provider)) return null;
    return { key: slug(provider), name: provider, category };
  }
  // A Marketplace product billed under Vercel's name still carries its maker in the product name.
  const known = service ? catalogSeller(service) : null;
  return known ? { key: known.key, name: known.name, category: known.category } : null;
}

const amount = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN);

/** The Vercel project a charge is tagged with, or null when Vercel ties it to none (a plan fee, a seat). */
function projectIdOf(row: ChargeRow): string | null {
  const tags = row.Tags && typeof row.Tags === "object" && !Array.isArray(row.Tags) ? row.Tags as Record<string, unknown> : {};
  const projectId = tags.ProjectId ?? tags.projectId;
  return typeof projectId === "string" && /^prj_[A-Za-z0-9]+$/.test(projectId) ? projectId : null;
}

/**
 * A USD charge's cost in dollars, or null for another currency or a row with no number.
 * EffectiveCost first: it spreads a plan fee over its days and counts usage the plan's included
 * credit covered, both of which BilledCost shows as zero. BilledCost when a row has no EffectiveCost.
 */
function usdCost(row: ChargeRow): number | null {
  if (row.BillingCurrency !== undefined && row.BillingCurrency !== "USD") return null;
  const effective = amount(row.EffectiveCost);
  if (Number.isFinite(effective)) return effective;
  const billed = amount(row.BilledCost);
  return Number.isFinite(billed) ? billed : null;
}

/** What Vercel actually charged on a USD row, beyond the plan: BilledCost. */
function usdCharged(row: ChargeRow): number {
  if (row.BillingCurrency !== undefined && row.BillingCurrency !== "USD") return 0;
  const billed = amount(row.BilledCost);
  return Number.isFinite(billed) ? billed : 0;
}

/**
 * The rows that belong to this account. Asked without a team, Vercel answers with the user's default
 * team's bill; those rows name that team as SubAccountId. Null when every row belongs to another
 * account, so the same bill is never counted twice. Rows with no SubAccountId are kept.
 */
export function rowsForAccount(rows: ChargeRow[], accountId: string): ChargeRow[] | null {
  const own = rows.filter((r) => typeof r.SubAccountId !== "string" || r.SubAccountId === accountId);
  return rows.length && !own.length ? null : own;
}

export function billedServices(rows: ChargeRow[]): BilledService[] {
  const byKey = new Map<string, { name: string; category: string; dollars: number; projectIds: Set<string> }>();
  for (const row of rows) {
    const cost = usdCost(row);
    if (cost === null) continue;
    const seller = sellerOf(row);
    if (!seller) continue;
    const entry = byKey.get(seller.key) ?? { name: seller.name, category: seller.category, dollars: 0, projectIds: new Set<string>() };
    entry.dollars += cost;
    const projectId = projectIdOf(row);
    if (projectId) entry.projectIds.add(projectId);
    byKey.set(seller.key, entry);
  }
  return [...byKey].map(([key, e]) => ({ key, name: e.name, category: e.category, cents: Math.max(0, Math.round(e.dollars * 100)), projectIds: [...e.projectIds].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export type BillLine = { name: string; cents: number };
export type Bill = { cents: number; products: BillLine[] };
export type ScopeBill = { projects: Record<string, Bill>; unassigned: Bill; chargedCents: number };

const PRODUCT_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .,&+()/:'-]{0,79}$/u;
const MAX_PRODUCTS = 12;
/** The product line for charges on a project Vercel no longer lists, such as a deleted one. */
export const UNLISTED = "Projects no longer listed";

/** The product a charge is for, in Vercel's words ("Function Invocations", "Neon Postgres"), or "Other". */
function productOf(row: ChargeRow): string {
  for (const v of [row.ServiceName, row.ServiceProviderName]) {
    const t = typeof v === "string" ? v.trim() : "";
    if (PRODUCT_NAME.test(t)) return t;
  }
  return "Other";
}

function toBill(byProduct: Map<string, number>): Bill {
  const all = [...byProduct].map(([name, dollars]) => ({ name, cents: Math.round(dollars * 100) }))
    .filter((l) => l.cents !== 0).sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  const products = all.slice(0, MAX_PRODUCTS);
  const rest = all.slice(MAX_PRODUCTS).reduce((sum, l) => sum + l.cents, 0);
  if (rest) {
    const other = products.find((l) => l.name === "Other");
    if (other) other.cents += rest; else products.push({ name: "Other", cents: rest });
  }
  const dollars = [...byProduct.values()].reduce((sum, d) => sum + d, 0);
  return { cents: Math.round(dollars * 100), products };
}

/**
 * Every charge on the bill, Vercel's own and outside sellers', as a total per project and per product.
 * Charges tagged with no project, or with a project not in `knownProjectIds`, count as unassigned.
 */
export function billByProject(rows: ChargeRow[], knownProjectIds: Set<string>): ScopeBill {
  const projects = new Map<string, Map<string, number>>();
  const unassigned = new Map<string, number>();
  let charged = 0;
  for (const row of rows) {
    const cost = usdCost(row);
    if (cost === null) continue;
    charged += usdCharged(row);
    const projectId = projectIdOf(row);
    const target = projectId && knownProjectIds.has(projectId)
      ? projects.get(projectId) ?? projects.set(projectId, new Map()).get(projectId)!
      : unassigned;
    const product = projectId && !knownProjectIds.has(projectId) ? UNLISTED : productOf(row);
    target.set(product, (target.get(product) ?? 0) + cost);
  }
  return { projects: Object.fromEntries([...projects].map(([id, m]) => [id, toBill(m)])), unassigned: toBill(unassigned), chargedCents: Math.round(charged * 100) };
}

/** The last 30 whole days in UTC: a monthly figure that includes a service added this month. */
export function billingWindow(nowMs: number): { from: string; to: string } {
  const today = new Date(nowMs);
  const to = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return { from: new Date(to - 30 * 86_400_000).toISOString(), to: new Date(to).toISOString() };
}

/** JSON lines, skipping blank lines. Null when any line is not JSON: a partial bill is not a bill. */
export function parseJsonLines(text: string): ChargeRow[] | null {
  const rows: ChargeRow[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const v = JSON.parse(t) as unknown;
      if (Array.isArray(v)) rows.push(...v.filter((x): x is ChargeRow => Boolean(x) && typeof x === "object"));
      else if (v && typeof v === "object") rows.push(v as ChargeRow);
    } catch { return null; }
  }
  return rows;
}
