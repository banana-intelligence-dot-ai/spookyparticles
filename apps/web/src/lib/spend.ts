/**
 * Recurring spend from receipts (cost semantics): pre-tax,
 * annual plans spread per month, usage bills as a trailing three-month average,
 * refunds and $0 invoices shown but not summed, unverified senders never summed.
 *
 * One subscription per vendor line: vendor names are normalized to one key
 * (Eleven Labs and ElevenLabs are one vendor), the same bill seen in two
 * inboxes counts once, and receipts within one inbox are clustered by amount so
 * "AppleCare One" and "AppleCare One Individual (Monthly)" at the same price are
 * one line while two different prices stay two lines. A single receipt with no
 * stated cadence is a one-off, not a subscription.
 *
 * Work and personal are kept apart: the headline sums work only. Pure grouping;
 * the API route feeds it receipt rows and a vendor scope map.
 */
import { SENDERS, type SenderCategory } from "@spooky/tier0";
import type { Receipt } from "@/db/schema";
import { dedupeKey } from "./extract/validate";

const VENDOR_CATEGORY = new Map<string, SenderCategory>(SENDERS.map((s) => [s.vendor.toLowerCase(), s.category]));

/** The vendor's category from the sender table, or "other" (consumer apps, unknown SaaS). */
export function vendorCategory(vendor: string): SenderCategory | "other" {
  return VENDOR_CATEGORY.get(vendor.trim().toLowerCase()) ?? "other";
}

export type Cadence = "monthly" | "annual" | "usage" | "one_time" | "unknown";
export type VendorScope = "work" | "personal" | "unknown";

/** Vendor keys that are the same company written differently, and their one display name. */
const VENDOR_ALIASES: Record<string, { key: string; name: string }> = {
  elevenlabs: { key: "elevenlabs", name: "ElevenLabs" },
  elevenlabsinc: { key: "elevenlabs", name: "ElevenLabs" },
  thesportsdb: { key: "thedatadb", name: "TheDataDB" },
  thedatadb: { key: "thedatadb", name: "TheDataDB" },
  appleservices: { key: "apple", name: "Apple" },
  applecom: { key: "apple", name: "Apple" },
  superpublishing: { key: "super", name: "Super" },
  superso: { key: "super", name: "Super" },
  googleone: { key: "googleone", name: "Google One" },
  amazonwebservices: { key: "aws", name: "AWS" },
  githubinc: { key: "github", name: "GitHub" },
};

const GOOGLE_ONE_PLAN = /google one|ai pro|ai premium|\b\d+\s?(gb|tb)\b/i;

/** Lowercase letters and digits only, through the alias table. "Eleven Labs" and "ElevenLabs" share a key. */
export function vendorKey(vendor: string, plan?: string | null): string {
  const raw = vendor.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (raw === "google" && plan && GOOGLE_ONE_PLAN.test(plan)) return "googleone";
  return VENDOR_ALIASES[raw]?.key ?? raw;
}

/** The display name for a vendor key: the alias table's, else the most common spelling seen. */
export function canonicalVendorName(key: string, seen: string[]): string {
  const alias = Object.values(VENDOR_ALIASES).find((a) => a.key === key);
  if (alias) return alias.name;
  return mostCommon(seen) ?? seen[0] ?? key;
}

export type Subscription = {
  /** Stable id: vendor key, line index within the inbox, connection id. */
  id: string;
  vendorKey: string;
  vendor: string;
  /** hosting, database, domains, dns_cdn, ai, payments_processor, dev_tools, saas, or other. */
  category: SenderCategory | "other";
  /** work (counted in the headline), personal (listed, never summed), unknown (listed, summed apart). */
  scope: VendorScope;
  plan: string | null;
  /** Inbox address the receipts arrived at. */
  inbox: string;
  /** Every inbox the same bill was seen in. */
  inboxes: string[];
  /** The addresses the vendor says it billed, when the receipt names one. Can differ from the inbox. */
  accountEmails: string[];
  connectionId: string;
  cadence: Cadence;
  /** Normalized monthly amount in minor units. Null when not recurring now. */
  monthlyCents: number | null;
  /** True when this line is recurring now (monthlyCents is known). */
  active: boolean;
  currency: string | null;
  lastBilledAt: string;
  nextExpectedAt: string | null;
  receipts: number;
  verified: boolean;
  receiptIds: string[];
  projectNames: string[];
};

export type SpendReport = {
  currency: string;
  /** Sum of active work subscriptions' monthlyCents, in `currency` only. */
  monthlyCents: number;
  /** Active personal subscriptions, same currency. Listed, never part of the headline. */
  personalMonthlyCents: number;
  /** Active subscriptions whose vendor could not be placed yet. */
  unknownMonthlyCents: number;
  /** Work spend split by vendor category. */
  byCategory: { category: SenderCategory | "other"; monthlyCents: number; count: number }[];
  /** Subscriptions in another currency, shown but not summed. */
  otherCurrencies: { currency: string; monthlyCents: number; count: number }[];
  subscriptions: Subscription[];
  activeCount: number;
  lapsedCount: number;
  unverified: number;
};

const DAY = 86_400_000;

type Row = Receipt & { inbox: string };

export function cadenceFromDates(dates: Date[], stated: string | null): Cadence {
  if (stated === "annual" || stated === "monthly") return stated;
  if (dates.length < 2) return stated === "usage" ? "usage" : "unknown";
  const sorted = [...dates].map((d) => d.getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) gaps.push((sorted[i] - sorted[i - 1]) / DAY);
  const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (median >= 300 && median <= 430) return "annual";
  if (median >= 25 && median <= 36) return stated === "usage" ? "usage" : "monthly";
  return stated === "usage" ? "usage" : "unknown";
}

/** The amount a subscription costs per month, from its receipts under the cadence. */
export function monthlyAmount(charges: { amountCents: number; billedAt: Date }[], cadence: Cadence, nowMs: number): number | null {
  const positive = charges.filter((c) => c.amountCents > 0).sort((a, b) => b.billedAt.getTime() - a.billedAt.getTime());
  if (!positive.length) return null;
  if (cadence === "annual") return Math.round(positive[0].amountCents / 12);
  if (cadence === "monthly") return positive[0].amountCents;
  if (cadence === "usage") {
    const recent = positive.filter((c) => nowMs - c.billedAt.getTime() <= 92 * DAY);
    const pool = recent.length ? recent : positive.slice(0, 3);
    return Math.round(pool.reduce((s, c) => s + c.amountCents, 0) / Math.max(1, Math.min(3, pool.length)));
  }
  return null;
}

/** Subscriptions whose last charge is older than this are not recurring any more. */
export const ACTIVE_WINDOW_DAYS = 75;
/** Receipts whose amounts are within this share of each other belong to one line. */
export const AMOUNT_CLUSTER_TOLERANCE = 0.02;

/**
 * The same bill seen more than once (cc'd to two inboxes, or forwarded) counts
 * once. Keeps the earliest-seen row and remembers every inbox it arrived at.
 */
export function dedupeReceipts(rows: Row[]): { rows: Row[]; inboxesOf: Map<string, string[]> } {
  const kept = new Map<string, Row>();
  const inboxesOf = new Map<string, string[]>();
  const out: Row[] = [];
  for (const r of rows) {
    const key = dedupeKey(r);
    if (!key) {
      out.push(r);
      inboxesOf.set(r.id, [r.inbox]);
      continue;
    }
    const first = kept.get(key);
    if (!first) {
      kept.set(key, r);
      out.push(r);
      inboxesOf.set(r.id, [r.inbox]);
      continue;
    }
    const list = inboxesOf.get(first.id) ?? [first.inbox];
    if (!list.includes(r.inbox)) list.push(r.inbox);
    inboxesOf.set(first.id, list);
  }
  return { rows: out, inboxesOf };
}

/** Greedy clustering by amount: sorted, a row starts a new line when it is more than the tolerance above the line's first amount. */
export function clusterByAmount<T extends { amountCents: number | null }>(rows: T[], tolerance = AMOUNT_CLUSTER_TOLERANCE): T[][] {
  const sorted = [...rows].sort((a, b) => (a.amountCents ?? 0) - (b.amountCents ?? 0));
  const lines: T[][] = [];
  let current: T[] = [];
  let ref = 0;
  for (const r of sorted) {
    const amt = r.amountCents ?? 0;
    if (current.length && amt > ref * (1 + tolerance)) {
      lines.push(current);
      current = [];
    }
    if (!current.length) ref = amt;
    current.push(r);
  }
  if (current.length) lines.push(current);
  return lines;
}

export function buildSpend(rows: Row[], opts: { nowMs?: number; currency?: string; scopes?: Map<string, VendorScope> } = {}): SpendReport {
  const nowMs = opts.nowMs ?? Date.now();
  const home = opts.currency ?? "USD";
  let unverified = 0;

  const charges: Row[] = [];
  for (const r of rows) {
    if (r.kind !== "receipt" || r.amountCents === null || r.amountCents <= 0 || !r.billedAt) continue;
    // Money that went to the user, or came back, is not spend.
    if (r.status && /^(payout|refunded|refund|credited)$/i.test(r.status)) continue;
    if (!r.senderVerified) {
      unverified += 1;
      continue;
    }
    charges.push(r);
  }

  const { rows: unique, inboxesOf } = dedupeReceipts(charges);

  // Group by vendor and inbox, then split each group into lines by amount.
  const groups = new Map<string, Row[]>();
  for (const r of unique) {
    const key = `${vendorKey(r.vendor, r.plan)}|${r.connectionId}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }

  const subscriptions: Subscription[] = [];
  for (const [groupKey, g] of groups) {
    const [vKey, connectionId] = groupKey.split("|");
    const vendor = canonicalVendorName(vKey, g.map((r) => r.vendor));
    const category = vendorCategory(vendor);
    const scope: VendorScope = opts.scopes?.get(vKey) ?? (category !== "other" ? "work" : "unknown");
    const lines = clusterByAmount(g).sort((a, b) => (b[0].amountCents ?? 0) - (a[0].amountCents ?? 0));

    lines.forEach((line, lineIndex) => {
      const dates = line.map((r) => r.billedAt as Date);
      const last = new Date(Math.max(...dates.map((d) => d.getTime())));
      const stated = mostCommon(line.map((r) => r.cadence).filter((c): c is string => Boolean(c) && c !== "unknown"));
      let cadence: Cadence = cadenceFromDates(dates, stated);
      const oneOff = line.length === 1 && (stated === null || stated === "one_time");
      if (oneOff) cadence = "one_time";
      const active = !oneOff && nowMs - last.getTime() <= (cadence === "annual" ? 400 : ACTIVE_WINDOW_DAYS) * DAY;
      const monthly = active
        ? monthlyAmount(line.map((r) => ({ amountCents: r.amountCents as number, billedAt: r.billedAt as Date })), cadence, nowMs)
        : null;
      const currency = mostCommon(line.map((r) => r.currency).filter((c): c is string => Boolean(c)));
      const next =
        monthly === null ? null : cadence === "monthly" ? new Date(last.getTime() + 30 * DAY) : cadence === "annual" ? new Date(last.getTime() + 365 * DAY) : null;
      const plans = line.map((r) => r.plan).filter((p): p is string => Boolean(p));
      const planKey = mostCommon(plans.map((p) => p.toLowerCase().trim()));
      const plan = planKey ? (plans.find((p) => p.toLowerCase().trim() === planKey) ?? null) : null;
      const inboxes = [...new Set(line.flatMap((r) => inboxesOf.get(r.id) ?? [r.inbox]))];
      // Only real addresses: a model sometimes puts the account holder's name in this field.
      const accountEmails = [...new Set(line.map((r) => r.accountEmail?.trim().toLowerCase()).filter((e): e is string => typeof e === "string" && e.includes("@")))];
      subscriptions.push({
        id: `${vKey}|${lineIndex}|${connectionId}`,
        vendorKey: vKey,
        vendor,
        category,
        scope,
        plan,
        inbox: line[0].inbox,
        inboxes,
        accountEmails,
        connectionId,
        cadence,
        monthlyCents: monthly,
        active: monthly !== null,
        currency,
        lastBilledAt: last.toISOString(),
        nextExpectedAt: next ? next.toISOString() : null,
        receipts: line.length,
        verified: true,
        receiptIds: line.map((r) => r.id),
        projectNames: [...new Set(line.flatMap((r) => r.projectNames))],
      });
    });
  }

  subscriptions.sort((a, b) => (b.monthlyCents ?? -1) - (a.monthlyCents ?? -1) || a.vendor.localeCompare(b.vendor));

  const others = new Map<string, { monthlyCents: number; count: number }>();
  const cats = new Map<SenderCategory | "other", { monthlyCents: number; count: number }>();
  let monthlyCents = 0;
  let personalMonthlyCents = 0;
  let unknownMonthlyCents = 0;
  for (const s of subscriptions) {
    if (s.monthlyCents === null) continue;
    if ((s.currency ?? home) !== home) {
      const o = others.get(s.currency as string) ?? { monthlyCents: 0, count: 0 };
      o.monthlyCents += s.monthlyCents;
      o.count += 1;
      others.set(s.currency as string, o);
      continue;
    }
    if (s.scope === "personal") {
      personalMonthlyCents += s.monthlyCents;
      continue;
    }
    if (s.scope === "unknown") {
      unknownMonthlyCents += s.monthlyCents;
      continue;
    }
    monthlyCents += s.monthlyCents;
    const c = cats.get(s.category) ?? { monthlyCents: 0, count: 0 };
    c.monthlyCents += s.monthlyCents;
    c.count += 1;
    cats.set(s.category, c);
  }

  return {
    currency: home,
    monthlyCents,
    personalMonthlyCents,
    unknownMonthlyCents,
    byCategory: [...cats.entries()].map(([category, c]) => ({ category, ...c })).sort((a, b) => b.monthlyCents - a.monthlyCents),
    otherCurrencies: [...others.entries()].map(([currency, o]) => ({ currency, ...o })),
    subscriptions,
    activeCount: subscriptions.filter((s) => s.active).length,
    lapsedCount: subscriptions.filter((s) => !s.active).length,
    unverified,
  };
}

function mostCommon(values: string[]): string | null {
  if (!values.length) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
