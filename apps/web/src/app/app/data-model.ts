/**
 * Response shapes the signed-in app reads from /api/v1, beyond connections
 * (connection-model.ts). Types only, plus small pure helpers the views share.
 */

export type GraphNode = {
  id: string;
  kind: string;
  externalKey?: string;
  name: string;
  status: string | null;
  attributes: Record<string, unknown>;
  lastActivityAt: string | null;
  monthlyCostCents?: number | null;
  currency?: string | null;
};

export type GraphEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: string;
  confidence: number;
  provenance: { source: string; call?: string; messageId?: string; at: string };
};

/** GET /api/v1/graph */
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** GET /api/v1/inventory */
export type Inventory = { total: number; byKind: Record<string, GraphNode[]> };

export type Cadence = "monthly" | "annual" | "usage" | "one_time" | "unknown";

/** work counts in the headline; personal is listed, never summed; unknown waits for the user. */
export type VendorScope = "work" | "personal" | "unknown";

export type Subscription = {
  id: string;
  /** Lowercase letters and digits; the key the scope override is stored under. */
  vendorKey: string;
  vendor: string;
  category: string;
  scope: VendorScope;
  plan: string | null;
  inbox: string;
  /** Every inbox the same bill was seen in. */
  inboxes: string[];
  cadence: Cadence;
  /** Pre-tax, per month. Annual plans spread per month, usage a trailing three-month average. */
  monthlyCents: number | null;
  currency: string | null;
  lastBilledAt: string;
  nextExpectedAt: string | null;
  receipts: number;
  /** False when the sender failed email authentication: shown, never summed. */
  verified: boolean;
  /** True when it is recurring now. False lines stopped billing. */
  active: boolean;
  /** Project names as the receipts wrote them. */
  projectNames: string[];
  /** The addresses the vendor says it billed, when a receipt names one. Can differ from the inbox. */
  accountEmails: string[];
  /** Repos (owner/repo) this line pays for. Empty: not linked to a repo. */
  projects: string[];
  /** The receipts behind the line, so a finding can be traced to it. */
  receiptIds: string[];
};

/** GET /api/v1/spend. monthlyCents is work only, in `currency`. */
export type Spend = {
  currency: string;
  monthlyCents: number;
  personalMonthlyCents: number;
  unknownMonthlyCents: number;
  byCategory: { category: string; monthlyCents: number; count: number }[];
  otherCurrencies: { currency: string; monthlyCents: number; count: number }[];
  activeCount: number;
  lapsedCount: number;
  unverified: number;
  subscriptions: Subscription[];
  /** The filters the server applied, echoed. */
  filters?: { project: string[]; inbox: string[] };
  /** Every repo with a linked line, then "unlinked"; monthlyCents is work. */
  projects?: { key: string; monthlyCents: number; lines: number }[];
  /** Every address a bill arrived at or was billed to. */
  inboxes?: { address: string; monthlyCents: number; lines: number }[];
};

export type FindingKind = "zombie" | "duplicate_plan" | "wrong_tier" | "expiring" | "expired_card" | "orphaned_key";
export type FindingStatus = "open" | "confirmed" | "dismissed";

export type Finding = {
  id: string;
  kind: FindingKind;
  title: string;
  amountCents: number | null;
  currency: string;
  confidence: number;
  status: FindingStatus;
  action: string;
  /** The vendor's billing page, when known: where the action is taken. */
  actionUrl?: string | null;
  evidence: {
    inbox: string | null;
    subjects: string[];
    receiptIds: string[];
    repo?: string | null;
    lastActivityAt?: string | null;
  };
  computedAt: string;
};

/** GET /api/v1/findings */
export type Findings = { findings: Finding[] };

export const FINDING_LABEL: Record<FindingKind, string> = {
  zombie: "No activity",
  duplicate_plan: "Duplicate plan",
  wrong_tier: "Wrong tier",
  expiring: "Expiring",
  expired_card: "Card declined",
  orphaned_key: "Orphaned key",
};

export const CADENCE_LABEL: Record<Cadence, string> = {
  monthly: "Monthly",
  annual: "Annual",
  usage: "Usage",
  one_time: "One-time",
  unknown: "Unknown",
};

/** "3 repos", with a non-breaking space so a count never ends a line alone. */
export const plural = (n: number, one: string, many: string) =>
  `${new Intl.NumberFormat("en-US").format(n)}\u00a0${n === 1 ? one : many}`;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "yesterday", "in 9 days". Under a minute reads "just now". */
export function relativeTime(iso: string, now: number): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export const absoluteTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
