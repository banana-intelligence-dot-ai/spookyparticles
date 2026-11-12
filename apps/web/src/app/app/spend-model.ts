/**
 * Spend, turned into what the pages draw: the work bars, the next 60 days, what can go,
 * and the user's own work or personal calls applied before the server catches up.
 * Pure: the Spend page, Today and the tests share it.
 */
import { formatCents } from "@/components/use-api";
import type { Finding, Spend, Subscription, VendorScope } from "./data-model";
import { NO_FILTERS, addressesOf, countable, matchesFilters, projectsOf, spendFacets, type SpendFilters } from "@/lib/spend-filter";
import type { Notice } from "./project-model";

const DAY = 86_400_000;

/** The user's calls not yet reflected by the server, by vendor key. */
export type ScopeOverrides = Record<string, Exclude<VendorScope, "unknown">>;

export const scopeOf = (s: Subscription, o: ScopeOverrides): VendorScope => o[s.vendorKey] ?? s.scope;

/** A line the headline can sum. Shared with the API's filters so both count the same lines. */
export { countable };

/**
 * What the chips offer, with the user's pending work or personal calls applied so a chip's
 * total is what the figure will show when it is picked.
 */
export function viewFacets(spend: Spend, o: ScopeOverrides, f: SpendFilters = NO_FILTERS) {
  const subs = spend.subscriptions.map((s) => (o[s.vendorKey] ? { ...s, scope: o[s.vendorKey] } : s));
  const all = spendFacets(subs, spend.currency);
  // Each row's totals honour the other row's pick: a repo chip shows that repo within the chosen address.
  const forProjects = spendFacets(subs.filter((s) => matchesFilters(s, { project: [], inbox: f.inbox })), spend.currency);
  const forInboxes = spendFacets(subs.filter((s) => matchesFilters(s, { project: f.project, inbox: [] })), spend.currency);
  // Lines and totals within the other pick; zero lines means the chip would match nothing.
  const within = <T extends { monthlyCents: number; lines: number }>(hit: T | undefined) => ({ monthlyCents: hit?.monthlyCents ?? 0, lines: hit?.lines ?? 0 });
  return {
    /** True when some line pays for more than one repo: repo totals then overlap. */
    shared: subs.some((s) => projectsOf(s).length > 1),
    /** True when some line reached more than one address: address totals then overlap. */
    sharedAddress: subs.some((s) => addressesOf(s).length > 1),
    projects: all.projects.map((p) => ({ ...p, ...within(forProjects.projects.find((x) => x.key === p.key)) })),
    inboxes: all.inboxes.map((i) => ({ ...i, ...within(forInboxes.inboxes.find((x) => x.address === i.address)) })),
  };
}

/**
 * The tertiary trailer on a row: its repos, then addresses worth naming, minus what the filter says.
 * Unfiltered, `usual` addresses (the main inbox, or the only one) are left out so the line only
 * appears when it tells you something. With an address picked, the line's other addresses read
 * "also ..." so it is clear the amount is one bill seen in more than one place.
 */
export function rowTrailer(s: Subscription, f: SpendFilters, usual: string[], label: (repo: string) => string = (r) => r): string[] {
  const not = (list: string[], out: string[]) => list.filter((x) => !out.some((c) => c.toLowerCase() === x.toLowerCase()));
  const repos = not(projectsOf(s), f.project).map(label);
  if (f.inbox.length) return [...repos, ...not(addressesOf(s), f.inbox).map((a) => `also ${a}`)];
  return [...repos, ...not(addressesOf(s), usual)];
}

/** Money in its own currency. USD always shows cents so columns line up. */
export function money(cents: number, currency: string | null): string {
  if (!currency || currency === "USD") return formatCents(cents);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Whole dollars, for estimates that say "about". */
export function roundMoney(cents: number, currency: string | null): string {
  const c = !currency ? "USD" : currency;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Math.round(cents / 100));
  } catch {
    return `${Math.round(cents / 100)} ${c}`;
  }
}

/** What the per-month figure is, when it is not a plain monthly bill. Shown beside the number. */
export function cadenceNote(s: Pick<Subscription, "cadence">): string | null {
  if (s.cadence === "annual") return "annual, spread";
  if (s.cadence === "usage") return "usage, 3-month average";
  if (s.cadence === "unknown") return "cadence unclear";
  return null;
}

export type SpendView = {
  /** Work per month, with the user's pending calls applied. */
  workCents: number;
  unknownCents: number;
  /** Work vendors in the headline currency, largest first. The bars. */
  work: Subscription[];
  /** Work vendors billed in another currency: listed, never summed. */
  foreign: Subscription[];
  /** Work lines from a sender that failed email checks: listed, never summed. */
  unverified: Subscription[];
  unknown: Subscription[];
  personal: Subscription[];
  stopped: Subscription[];
  /** Distinct inboxes the work total was read from. */
  inboxes: string[];
};

export function viewSpend(spend: Spend, o: ScopeOverrides): SpendView {
  const cur = spend.currency;
  let workCents = spend.monthlyCents;
  let unknownCents = spend.unknownMonthlyCents;
  for (const s of spend.subscriptions) {
    const next = o[s.vendorKey];
    if (!next || next === s.scope || !countable(s, cur)) continue;
    const c = s.monthlyCents ?? 0;
    if (s.scope === "work") workCents -= c;
    if (s.scope === "unknown") unknownCents -= c;
    if (next === "work") workCents += c;
  }
  const active = spend.subscriptions.filter((s) => s.active);
  const by = (scope: VendorScope) => active.filter((s) => scopeOf(s, o) === scope);
  const big = (a: Subscription, b: Subscription) => (b.monthlyCents ?? -1) - (a.monthlyCents ?? -1) || a.vendor.localeCompare(b.vendor);
  const workAll = by("work");
  const work = workAll.filter((s) => countable(s, cur)).sort(big);
  return {
    workCents: Math.max(0, workCents),
    unknownCents: Math.max(0, unknownCents),
    work,
    foreign: workAll.filter((s) => s.verified && s.monthlyCents !== null && (s.currency ?? cur) !== cur).sort(big),
    unverified: workAll.filter((s) => !s.verified).sort(big),
    unknown: by("unknown").sort(big),
    personal: by("personal").sort(big),
    stopped: spend.subscriptions.filter((s) => !s.active).sort((a, b) => b.lastBilledAt.localeCompare(a.lastBilledAt)),
    inboxes: [...new Set(work.flatMap((s) => (s.inboxes.length ? s.inboxes : [s.inbox])))].sort(),
  };
}

export type Due = {
  id: string;
  at: number;
  /** What it is about: the domain or the vendor. */
  label: string;
  vendor: string;
  kind: "charge" | "renewal" | "trial";
  amount: string | null;
  /** Amber: someone has to decide before the date. Expected charges are plain. */
  tone: "amber" | null;
  /** Where the date came from, in words. */
  source: string;
  /** Where to act: the vendor's billing page, when known. */
  url: string | null;
  /** Cents in the subscription's currency, for the window total. Null when unknown. */
  cents: number | null;
  currency: string | null;
  /** True for a charge projected past the next expected one. */
  repeat: boolean;
  /** Counts toward the work total due: work vendors in the headline currency. */
  work: boolean;
};

const sameVendor = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * What is coming in the next `days`: expected charges from past receipts (work and unsorted
 * only), plus renewals and trials the vendors emailed about. A vendor's notice replaces its
 * expected charge when they fall within a week of each other.
 */
export function dueItems(spend: Spend | null, notices: Notice[], o: ScopeOverrides, now: number, days = 60): Due[] {
  const end = now + days * DAY;
  const subs = spend?.subscriptions ?? [];
  const personal = (vendor: string) => subs.some((s) => sameVendor(s.vendor, vendor) && scopeOf(s, o) === "personal");
  const out: Due[] = [];
  const seen = new Set<string>();
  for (const n of notices) {
    if (!n.verified || !n.dueAt || (n.kind !== "renewal_notice" && n.kind !== "trial_notice")) continue;
    const at = Date.parse(n.dueAt);
    if (at < now - DAY / 2 || at > end || personal(n.vendor)) continue;
    const key = `${n.vendor}|${n.kind}|${n.dueAt.slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A trial email rarely names a price; the plan's own receipts do.
    const after = n.amountCents === null ? subs.find((s) => sameVendor(s.vendor, n.vendor) && s.active && s.monthlyCents !== null) : undefined;
    out.push({
      id: n.id,
      at,
      label: n.domainNames[0] ?? n.vendor,
      vendor: n.vendor,
      kind: n.kind === "trial_notice" ? "trial" : "renewal",
      amount: n.amountCents !== null ? money(n.amountCents, n.currency) : after ? `then ${money(after.monthlyCents!, after.currency)}/mo` : null,
      tone: "amber",
      source: `${n.kind === "trial_notice" ? "Trial" : "Renewal"} email from ${n.vendor} to ${n.inbox}`,
      url: n.vendorUrl,
      cents: n.amountCents,
      currency: n.currency,
      repeat: false,
      work: !subs.some((s) => sameVendor(s.vendor, n.vendor) && scopeOf(s, o) === "unknown"),
    });
  }
  for (const s of subs) {
    if (!s.active || !s.verified || !s.nextExpectedAt || scopeOf(s, o) === "personal") continue;
    const per = s.cadence === "annual" ? 12 : 1;
    const cents = s.monthlyCents === null ? null : s.monthlyCents * per;
    const estimate = s.cadence === "annual" || s.cadence === "usage";
    // Monthly bills come round again inside the window; each repeat is the same projection.
    const first = new Date(s.nextExpectedAt);
    for (let k = 0; k < (s.cadence === "monthly" || s.cadence === "usage" ? 3 : 1); k += 1) {
      const d = new Date(first);
      d.setUTCMonth(first.getUTCMonth() + k);
      const at = d.getTime();
      if (at > end) break;
      if (at < now - DAY / 2) continue;
      if (out.some((x) => x.kind !== "charge" && sameVendor(x.vendor, s.vendor) && Math.abs(x.at - at) <= 7 * DAY)) continue;
      out.push({
        id: `${s.id}#${k}`,
        at,
        label: s.vendor,
        vendor: s.vendor,
        kind: "charge",
        amount: cents === null ? null : estimate ? `about ${roundMoney(cents, s.currency)}` : money(cents, s.currency),
        tone: null,
        source: `Expected from ${s.receipts === 1 ? "1 past receipt" : `${s.receipts} past receipts`} in ${s.inbox}${estimate ? ". An estimate" : ""}`,
        url: null,
        cents,
        currency: s.currency,
        repeat: k > 0,
        work: scopeOf(s, o) === "work" && (s.currency ?? spend!.currency) === spend!.currency,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Findings whose amount is money you stop paying. The rest are risks or dates. */
export const SAVING_KINDS = new Set<Finding["kind"]>(["zombie", "duplicate_plan", "wrong_tier", "orphaned_key"]);

/** "Can go": open money findings, largest first. */
export function canGo(findings: Finding[]): Finding[] {
  return findings
    .filter((f) => f.status !== "dismissed" && SAVING_KINDS.has(f.kind))
    .sort((a, b) => (b.amountCents ?? -1) - (a.amountCents ?? -1));
}

/** "Nov 13" in the viewer's zone; date-only values (midnight UTC) stay on their own day. */
export function dueDate(ms: number): string {
  const d = new Date(ms);
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: dateOnly ? "UTC" : undefined }).format(d);
}

/** "ledger-api" for octocat/ledger-api, unless two owners have a repo by that name: then the full name. */
export function repoLabeler(names: string[]): (name: string) => string {
  const base = (n: string) => n.slice(n.indexOf("/") + 1);
  const counts = new Map<string, number>();
  for (const n of new Set(names.map((x) => x.toLowerCase()))) counts.set(base(n), (counts.get(base(n)) ?? 0) + 1);
  return (n) => ((counts.get(base(n.toLowerCase())) ?? 0) > 1 ? n : base(n));
}
