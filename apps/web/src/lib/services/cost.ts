/**
 * What a service costs a month, and who said so. Three sources, kept side by side
 * on the service node (attributes.costs) so one never erases another:
 *   vercel billing: summed from Vercel's billing charges for the last 30 days
 *   recorded by you: a person, signed in
 *   recorded by agent: an API key
 * The shown cost is the first that exists, in that order: a bill beats a person's
 * note, and a person's note beats an agent's. Nothing is ever estimated.
 */
export type CostSource = "vercel billing" | "recorded by you" | "recorded by agent";
export type BillingCost = { cents: number; from: string; to: string; at: string; scopes: Record<string, number> };
export type RecordedCost = { cents: number; at: string };
export type Costs = { vercel_billing?: BillingCost; you?: RecordedCost; agent?: RecordedCost };

/** A billing figure older than this is no longer shown as current. */
const BILLING_FRESH_MS = 45 * 86_400_000;

export function readCosts(attributes: Record<string, unknown>, legacyCents: number | null): Costs {
  const raw = attributes.costs;
  const costs: Costs = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Costs) } : {};
  // A cost saved before sources were kept could only come from record_service, the agent tool.
  if (!raw && legacyCents !== null) costs.agent = { cents: legacyCents, at: "" };
  return costs;
}

export function chosenCost(costs: Costs, nowMs: number): { cents: number; source: CostSource; note: string } | null {
  const bill = costs.vercel_billing;
  if (bill && Number.isFinite(Date.parse(bill.at)) && nowMs - Date.parse(bill.at) <= BILLING_FRESH_MS) {
    return { cents: bill.cents, source: "vercel billing", note: `Vercel billing, ${bill.from.slice(0, 10)} to ${bill.to.slice(0, 10)}` };
  }
  if (costs.you) return { cents: costs.you.cents, source: "recorded by you", note: "Recorded by you" };
  if (costs.agent) return { cents: costs.agent.cents, source: "recorded by agent", note: "Recorded by your agent" };
  return null;
}

/** Why a cost is unknown, in one plain sentence. */
export function unknownCostNote(billingReadable: boolean): string {
  return billingReadable
    ? "Unknown. Vercel billing has no charge for it and nobody recorded a cost."
    : "Unknown. Vercel billing is not readable with this connection and nobody recorded a cost.";
}

/** One scope's billing read, merged in. Null cents means this scope no longer bills the service. */
export function mergeBilling(costs: Costs, scopeId: string, cents: number | null, period: { from: string; to: string }, at: string): Costs {
  const scopes = { ...(costs.vercel_billing?.scopes ?? {}) };
  if (cents === null) delete scopes[scopeId];
  else scopes[scopeId] = cents;
  const next: Costs = { ...costs };
  if (!Object.keys(scopes).length) delete next.vercel_billing;
  else next.vercel_billing = { cents: Object.values(scopes).reduce((a, b) => a + b, 0), from: period.from, to: period.to, at, scopes };
  return next;
}

export function recordCost(costs: Costs, by: "you" | "agent", cents: number, at: string): Costs {
  return { ...costs, [by]: { cents, at } };
}
