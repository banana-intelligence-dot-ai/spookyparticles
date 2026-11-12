/**
 * Spend by project and by address. One pure module for the read API and the Spend page, so
 * `GET /api/v1/spend?project=hubot/notify-cli` and the page's chips always agree.
 *
 * Project: the repos a line pays for (linkSubscriptions), or "unlinked" for lines no repo
 * claims. Address: every inbox the bill arrived at, plus the address the vendor says it
 * billed. Values inside one filter are alternatives; project and address together narrow.
 * A filtered report keeps the unfiltered shape, with every total worked out again from the
 * lines that match. No imports: safe in the browser bundle.
 */

export const UNLINKED = "unlinked";

export type SpendFilters = { project: string[]; inbox: string[] };
export const NO_FILTERS: SpendFilters = { project: [], inbox: [] };

type Scope = "work" | "personal" | "unknown";

/** The fields filtering reads. Both the server's and the client's Subscription fit. */
export type FilterLine = {
  id: string;
  vendor: string;
  vendorKey: string;
  category: string;
  scope: Scope;
  active: boolean;
  verified: boolean;
  monthlyCents: number | null;
  currency: string | null;
  inbox: string;
  inboxes: string[];
  accountEmails?: string[];
  /** Repo names (owner/repo) this line pays for. Empty or absent: not linked. */
  projects?: string[];
  receiptIds?: string[];
};

export type FilterReport<L extends FilterLine> = {
  currency: string;
  monthlyCents: number;
  personalMonthlyCents: number;
  unknownMonthlyCents: number;
  byCategory: { category: L["category"]; monthlyCents: number; count: number }[];
  otherCurrencies: { currency: string; monthlyCents: number; count: number }[];
  activeCount: number;
  lapsedCount: number;
  unverified: number;
  subscriptions: L[];
};

const clean = (values: string[], lower: boolean) => {
  const out: string[] = [];
  for (const v of values) {
    const t = lower ? v.trim().toLowerCase() : v.trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
};

/** `?project=owner/repo&project=unlinked&inbox=you@example.com`, repeatable. Addresses compare lowercase. */
export function parseSpendFilters(params: URLSearchParams): SpendFilters {
  return { project: clean(params.getAll("project"), false), inbox: clean(params.getAll("inbox"), true) };
}

/** The query string for a set of filters, without the leading "?". Empty when nothing is filtered. */
export function spendFilterQuery(f: SpendFilters): string {
  const q = new URLSearchParams();
  for (const p of f.project) q.append("project", p);
  for (const i of f.inbox) q.append("inbox", i);
  return q.toString();
}

export const isFiltered = (f: SpendFilters) => f.project.length > 0 || f.inbox.length > 0;

/** Every address a line belongs to: the inboxes it arrived at, then the addresses the vendor billed. */
export function addressesOf(s: Pick<FilterLine, "inbox" | "inboxes" | "accountEmails">): string[] {
  const all = [...(s.inboxes.length ? s.inboxes : [s.inbox]), ...(s.accountEmails ?? [])];
  return [...new Set(all.map((a) => a.trim().toLowerCase()).filter(Boolean))];
}

export const projectsOf = (s: Pick<FilterLine, "projects">) => s.projects ?? [];

export function matchesFilters(s: FilterLine, f: SpendFilters): boolean {
  const mine = projectsOf(s).map((p) => p.toLowerCase());
  const projectOk =
    !f.project.length || f.project.some((p) => (p.toLowerCase() === UNLINKED ? mine.length === 0 : mine.includes(p.toLowerCase())));
  if (!projectOk) return false;
  if (!f.inbox.length) return true;
  const addrs = addressesOf(s);
  return f.inbox.some((i) => addrs.includes(i.toLowerCase()));
}

/** A line the headline can sum: recurring now, sender verified, an amount, the headline's currency. */
export const countable = (s: Pick<FilterLine, "active" | "verified" | "monthlyCents" | "currency">, currency: string) =>
  s.active && s.verified && s.monthlyCents !== null && s.monthlyCents > 0 && (s.currency ?? currency) === currency;

/** Every total of a report, worked out from its lines. Matches buildSpend for the lines given. */
export function spendTotals<L extends FilterLine>(subs: L[], currency: string): Omit<FilterReport<L>, "currency" | "subscriptions"> {
  let monthlyCents = 0;
  let personalMonthlyCents = 0;
  let unknownMonthlyCents = 0;
  const cats = new Map<L["category"], { monthlyCents: number; count: number }>();
  const others = new Map<string, { monthlyCents: number; count: number }>();
  for (const s of subs) {
    if (!s.active || !s.verified || s.monthlyCents === null || s.monthlyCents <= 0) continue;
    if ((s.currency ?? currency) !== currency) {
      const o = others.get(s.currency as string) ?? { monthlyCents: 0, count: 0 };
      o.monthlyCents += s.monthlyCents;
      o.count += 1;
      others.set(s.currency as string, o);
      continue;
    }
    if (s.scope === "personal") personalMonthlyCents += s.monthlyCents;
    else if (s.scope === "unknown") unknownMonthlyCents += s.monthlyCents;
    else {
      monthlyCents += s.monthlyCents;
      const c = cats.get(s.category) ?? { monthlyCents: 0, count: 0 };
      c.monthlyCents += s.monthlyCents;
      c.count += 1;
      cats.set(s.category, c);
    }
  }
  return {
    monthlyCents,
    personalMonthlyCents,
    unknownMonthlyCents,
    byCategory: [...cats.entries()].map(([category, c]) => ({ category, ...c })).sort((a, b) => b.monthlyCents - a.monthlyCents),
    otherCurrencies: [...others.entries()].map(([cur, o]) => ({ currency: cur, ...o })),
    activeCount: subs.filter((s) => s.active).length,
    lapsedCount: subs.filter((s) => !s.active).length,
    unverified: subs.filter((s) => !s.verified).length,
  };
}

/** The report with only matching lines, every total redone. Unfiltered, the report comes back as is. */
export function filterSpend<L extends FilterLine, R extends FilterReport<L>>(spend: R, f: SpendFilters): R {
  if (!isFiltered(f)) return spend;
  const subscriptions = spend.subscriptions.filter((s) => matchesFilters(s, f));
  return { ...spend, ...spendTotals(subscriptions, spend.currency), subscriptions };
}

export type ProjectFacet = { key: string; monthlyCents: number; lines: number };
export type InboxFacet = { address: string; monthlyCents: number; lines: number };

/**
 * What can be filtered on: each repo with at least one linked work line, then "unlinked" when
 * any work line has no repo; each address a work line reached. Personal and unknown lines are
 * left out: the page is "for work", and a gym's billing address is not a chip worth offering.
 * monthlyCents is the work total the headline would show.
 */
export function spendFacets(lines: FilterLine[], currency: string): { projects: ProjectFacet[]; inboxes: InboxFacet[] } {
  const subs = lines.filter((s) => s.scope === "work");
  const projects = new Map<string, ProjectFacet>();
  const inboxes = new Map<string, InboxFacet>();
  const add = <T extends { monthlyCents: number; lines: number }>(m: Map<string, T>, key: string, make: () => T, s: FilterLine) => {
    const f = m.get(key) ?? make();
    f.lines += 1;
    if (s.scope === "work" && countable(s, currency)) f.monthlyCents += s.monthlyCents ?? 0;
    m.set(key, f);
  };
  for (const s of subs) {
    const ps = projectsOf(s);
    for (const p of ps.length ? ps : [UNLINKED]) add(projects, p, () => ({ key: p, monthlyCents: 0, lines: 0 }), s);
    for (const a of addressesOf(s)) add(inboxes, a, () => ({ address: a, monthlyCents: 0, lines: 0 }), s);
  }
  const unlinked = projects.get(UNLINKED);
  projects.delete(UNLINKED);
  const byMoney = <T extends { monthlyCents: number; lines: number }>(a: T, b: T) => b.monthlyCents - a.monthlyCents || b.lines - a.lines;
  return {
    projects: [...[...projects.values()].sort((a, b) => byMoney(a, b) || a.key.localeCompare(b.key)), ...(unlinked ? [unlinked] : [])],
    inboxes: [...inboxes.values()].sort((a, b) => byMoney(a, b) || a.address.localeCompare(b.address)),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Renewal and trial emails that belong to the filtered lines: same vendor as a matching line,
 * and sent to a chosen address when one is chosen. Unfiltered, all of them.
 */
export function filterNotices<N extends { vendor: string; inbox: string }>(notices: N[], matching: FilterLine[], f: SpendFilters): N[] {
  if (!isFiltered(f)) return notices;
  const vendors = new Set(matching.map((s) => norm(s.vendor)));
  return notices.filter((n) => vendors.has(norm(n.vendor)) && (!f.inbox.length || f.inbox.includes(n.inbox.trim().toLowerCase())));
}

/**
 * Findings that rest on the filtered lines: a receipt of a matching line, or the finding's own
 * repo and inbox when it names them. Unfiltered, all of them.
 */
export function filterFindings<F extends { evidence: { inbox: string | null; receiptIds: string[]; repo?: string | null } }>(
  findings: F[],
  matching: FilterLine[],
  f: SpendFilters,
): F[] {
  if (!isFiltered(f)) return findings;
  const receipts = new Set(matching.flatMap((s) => s.receiptIds ?? []));
  const wantRepo = f.project.map((p) => p.toLowerCase());
  const inboxOk = (e: F["evidence"]) => !f.inbox.length || Boolean(e.inbox && f.inbox.includes(e.inbox.toLowerCase()));
  return findings.filter((x) => {
    const e = x.evidence;
    if (e.receiptIds.some((id) => receipts.has(id))) return true;
    if (f.project.length) return Boolean(e.repo && wantRepo.includes(e.repo.toLowerCase())) && inboxOk(e);
    return inboxOk(e);
  });
}

/** The filters in words, for the note under the figure: "hubot/notify-cli, billing@example.com". */
export function describeFilters(f: SpendFilters): string {
  return [...f.project.map((p) => (p.toLowerCase() === UNLINKED ? "not linked to a repo" : p)), ...f.inbox].join(", ");
}

/**
 * The GET /api/v1/spend body: the report narrowed by `filters`, each line with its repos and
 * addresses, the filters echoed, and every project and address an agent could filter on.
 */
export function spendApiReport<
  S extends FilterLine & {
    plan: string | null;
    cadence: string;
    lastBilledAt: string;
    nextExpectedAt: string | null;
    receipts: number;
    projectNames: string[];
    accountEmails: string[];
    receiptIds: string[];
  },
>(report: FilterReport<S>, links: Map<string, string[]>, filters: SpendFilters) {
  const linked = { ...report, subscriptions: report.subscriptions.map((s) => ({ ...s, projects: links.get(s.id) ?? [] })) };
  const out = filterSpend(linked, filters);
  const facets = spendFacets(linked.subscriptions, report.currency);
  return {
    currency: out.currency,
    monthlyCents: out.monthlyCents,
    personalMonthlyCents: out.personalMonthlyCents,
    unknownMonthlyCents: out.unknownMonthlyCents,
    byCategory: out.byCategory,
    otherCurrencies: out.otherCurrencies,
    activeCount: out.activeCount,
    lapsedCount: out.lapsedCount,
    unverified: out.unverified,
    subscriptions: out.subscriptions.map((x) => ({
      id: x.id,
      vendorKey: x.vendorKey,
      vendor: x.vendor,
      category: x.category,
      scope: x.scope,
      plan: x.plan,
      inbox: x.inbox,
      inboxes: x.inboxes,
      accountEmails: x.accountEmails,
      cadence: x.cadence,
      active: x.active,
      monthlyCents: x.monthlyCents,
      currency: x.currency,
      lastBilledAt: x.lastBilledAt,
      nextExpectedAt: x.nextExpectedAt,
      receipts: x.receipts,
      verified: x.verified,
      projectNames: x.projectNames,
      projects: x.projects,
      receiptIds: x.receiptIds,
    })),
    filters,
    projects: facets.projects,
    inboxes: facets.inboxes,
  };
}
