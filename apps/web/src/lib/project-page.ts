/**
 * One project, everything we can prove about it: where it runs, the domains it answers on,
 * the services that bill for it, what it costs a month, and what could be saved. Pure, and
 * safe in the browser bundle: the read API, the page and the dev preview all build it here.
 *
 * Sources are GitHub (repo metadata and deployments, read-only) and billing mail. Nothing is
 * guessed: no framework detection, no traffic, no database activity. Those need host
 * connections. Cost is Spend's math (spend-filter) over the lines linked to this repo, each
 * line counted once even when it also serves other repos.
 */
import { billingUrl, matchRepo } from "./findings-rules";
import { providerFromUrl } from "./hosts";
import { matchesFilters, spendTotals, type FilterLine } from "./spend-filter";

const DAY = 86_400_000;
/** A paid host with no deploy in this many days is worth a look. */
export const IDLE_HOST_DAYS = 90;
/** Databases often outlive deploys a while; the bar is higher. */
export const IDLE_DATABASE_DAYS = 120;
/** A domain renewing within this many days, with nothing live, is worth a look. */
export const RENEWAL_WINDOW_DAYS = 60;

// ---------- Input ----------

export type PageRepo = {
  id: string;
  /** owner/repo */
  name: string;
  url: string | null;
  private: boolean | null;
  defaultBranch: string | null;
  language: string | null;
  status: string | null;
  lastPushAt: string | null;
  health: "failed" | "attention" | "ok" | "idle" | "archived" | "unknown";
};

export type PageDeployment = {
  environment: string;
  state: string | null;
  url: string | null;
  at: string | null;
  provider: string | null;
  creator: string | null;
};

/** A spend line, as Spend has it, with the repos it pays for. Server and client Subscriptions fit. */
export type PageLine = FilterLine & {
  plan: string | null;
  cadence: string;
  lastBilledAt: string;
  receipts: number;
  accountEmails: string[];
  receiptIds: string[];
  projects: string[];
};

export type PageReceipt = {
  id: string;
  kind: string;
  vendor: string;
  amountCents: number | null;
  currency: string | null;
  /** Charge date, else the email's date. */
  at: string | null;
  dueAt: string | null;
  projectNames: string[];
  domainNames: string[];
  inbox: string;
  subject: string | null;
  verified: boolean;
};

export type PageFinding = {
  id: string;
  kind: string;
  title: string;
  action: string;
  amountCents: number | null;
  currency: string;
  status: "open" | "confirmed" | "dismissed";
  actionUrl?: string | null;
  evidence: { inbox: string | null; subjects: string[]; receiptIds: string[]; repo?: string | null; lastActivityAt?: string | null };
};

export type ProjectPageInput = {
  repo: PageRepo;
  deployments: PageDeployment[];
  /** Every spend line the user has; the builder keeps the ones linked to this repo. */
  lines: PageLine[];
  /** Receipts and notices; the builder keeps the ones that touch this repo. */
  receipts: PageReceipt[];
  /** Every finding, any status: open ones are shown, dismissed ones keep new rules quiet. */
  findings: PageFinding[];
  /** Every repo name the user has, so a receipt naming another repo is not claimed here. */
  repoNames: string[];
  currency: string;
  nowMs: number;
};

// ---------- Output: GET /api/v1/projects/{owner}/{repo} ----------

export type EvidenceRow = { label: string; value: string; at: string | null; source: string };

export type Recommendation = {
  /** The finding's id, or the project rule's key. */
  id: string;
  /** "finding": the account-wide engine (Spend shows it too). "project": a rule only this page runs. */
  source: "finding" | "project";
  kind: string;
  title: string;
  action: string;
  amountCents: number | null;
  currency: string;
  /** What the amount is: per month, or one renewal. */
  per: "month" | "renewal";
  /** When a renewal is due, as the notice states it. */
  dueAt: string | null;
  vendor: string | null;
  /** The vendor's billing page: where the action is taken. Nothing here is executed. */
  billingUrl: string | null;
  evidence: EvidenceRow[];
  /**
   * Two hosts for one repo: the same evidence, one entry per host, so a reader can set them side
   * by side. Present only on "two_hosts".
   */
  hosts?: HostSide[];
};

export type HostSide = {
  /** "Vercel Pro": vendor and plan. */
  name: string;
  vendor: string;
  monthlyCents: number | null;
  currency: string;
  /** Production's latest successful deploy is on this host. */
  production: boolean;
  /** The one to cancel if it no longer serves the repo. */
  candidate: boolean;
  bill: EvidenceRow;
  /** The latest deploy from this host, without the vendor (the side names it). */
  deploy: EvidenceRow;
  billingUrl: string | null;
};

export type ProjectDeploymentRow = PageDeployment & { source: string };

export type DomainRow = {
  name: string;
  /** Where we saw it: a deploy URL, a receipt, or both. */
  seenIn: ("deploy" | "receipt")[];
  /** A deploy that answers on this domain succeeded. */
  live: boolean;
  registrar: string | null;
  renewsAt: string | null;
  renewalCents: number | null;
  currency: string | null;
  /** The inbox the renewal notice arrived at. */
  receivedBy: string | null;
  billingUrl: string | null;
  source: string;
};

export type ServiceRow = {
  id: string;
  vendor: string;
  vendorKey: string;
  plan: string | null;
  category: string;
  scope: "work" | "personal" | "unknown";
  cadence: string;
  monthlyCents: number | null;
  currency: string | null;
  active: boolean;
  verified: boolean;
  /** Counted in this project's monthly cost. */
  counted: boolean;
  /** Who it bills: the address the vendor names, else the inbox it arrives at. */
  owner: string;
  inbox: string;
  /** Other repos the same line pays for. */
  sharedWith: string[];
  lastBilledAt: string;
  receipts: number;
  billingUrl: string | null;
  source: string;
};

export type ServiceGroup = { category: string; label: string; services: ServiceRow[] };

export type ProjectPage = {
  elsewhere?: { host: string; importUrl: string; guideUrl: string | null; guideTitle: string | null } | null;
  project: PageRepo & {
    owner: string;
    repo: string;
    /** The production deploy's URL, else the newest deploy URL. */
    liveUrl: string | null;
    live: boolean;
    host: string | null;
  };
  stack: {
    language: string | null;
    hosts: { name: string; seenIn: ("deploys" | "bills")[] }[];
    services: { category: string; label: string; vendors: string[] }[];
    source: string;
  };
  cogs: {
    monthlyCents: number;
    currency: string;
    /** Lines counted in monthlyCents. */
    bills: number;
    /** Inboxes the counted bills arrive at. */
    sources: string[];
    /** Counted lines that also pay for other repos: counted once here, not split. */
    shared: { vendor: string; plan: string | null; monthlyCents: number; otherProjects: string[] }[];
    /** Linked lines whose vendor nobody has placed as work or personal yet, summed apart. */
    unknownMonthlyCents: number;
    personalMonthlyCents: number;
    otherCurrencies: { currency: string; monthlyCents: number; count: number }[];
    /** Linked lines not counted: stopped, unverified sender, or no amount. */
    notCounted: number;
    /** Spend, filtered to this project. */
    spendPath: string;
    source: string;
  };
  deployments: ProjectDeploymentRow[];
  domains: DomainRow[];
  services: ServiceGroup[];
  recommendations: Recommendation[];
  /** What this page cannot see yet, said once. */
  notObserved: string[];
};

// ---------- Helpers ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const lower = (s: string) => s.trim().toLowerCase();
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const days = (iso: string, nowMs: number) => Math.floor((nowMs - Date.parse(iso)) / DAY);
const hostOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
const COUNT_WORD: Record<number, string> = { 2: "Two", 3: "Three", 4: "Four" };
const shortName = (repo: string) => repo.split("/").pop() ?? repo;

export const CATEGORY_LABEL: Record<string, string> = {
  hosting: "Hosting",
  database: "Database",
  domains: "Domains",
  dns_cdn: "DNS and CDN",
  ai: "AI",
  dev_tools: "Dev tools",
  saas: "SaaS",
  payments_processor: "Payments",
  other: "Other",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

/** Production first, then failed, then newest. */
function orderDeploys(list: PageDeployment[]): PageDeployment[] {
  const rank = (d: PageDeployment) => (lower(d.environment) === "production" ? 0 : d.state === "failure" || d.state === "error" ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || (b.at ?? "").localeCompare(a.at ?? ""));
}

/** A deploy URL on the user's own domain (not *.vercel.app, not github.com). */
export function customDomainOf(url: string | null): string | null {
  const h = hostOf(url);
  if (!h || h === "localhost" || h === "github.com" || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  return providerFromUrl(url) ? null : h;
}

/**
 * Why a receipt belongs to this repo, or null. A receipt of a linked line; one naming the repo
 * (matchRepo, the same test Spend uses); one naming a domain a deploy answers on; or a domain
 * whose name is the repo's ("spookyparticles.com" for spooky-particles) and no other repo's.
 */
export function receiptTouches(
  r: Pick<PageReceipt, "id" | "projectNames" | "domainNames">,
  repo: string,
  ctx: { linkedReceiptIds: Set<string>; deployDomains: Set<string>; repoNames: string[] },
): "line" | "name" | "deploy domain" | "domain name" | null {
  if (ctx.linkedReceiptIds.has(r.id)) return "line";
  const refs = ctx.repoNames.map((name) => ({ id: name, name, status: null, lastActivityAt: null }));
  for (const n of [...r.projectNames, ...r.domainNames]) {
    const m = matchRepo(n, refs);
    if (m && lower(m.name) === lower(repo)) return "name";
  }
  for (const d of r.domainNames) if (ctx.deployDomains.has(lower(d).replace(/^www\./, ""))) return "deploy domain";
  const mine = norm(shortName(repo));
  for (const d of r.domainNames) {
    const label = norm(lower(d).replace(/^www\./, "").split(".")[0] ?? "");
    if (label.length >= 3 && label === mine) {
      const others = ctx.repoNames.filter((n) => lower(n) !== lower(repo) && norm(shortName(n)) === label);
      if (!others.length) return "domain name";
    }
  }
  return null;
}

const TOUCH_SOURCE = {
  line: "a receipt of a linked bill",
  name: "a receipt naming this project",
  "deploy domain": "a notice naming a domain this project deploys to",
  "domain name": "a notice for a domain named after this repo",
} as const;

// ---------- Builder ----------

export function buildProjectPage(input: ProjectPageInput): ProjectPage {
  const { repo, currency, nowMs } = input;
  const name = repo.name;
  const [owner, ...rest] = name.split("/");
  const deploys = orderDeploys(input.deployments);
  const production = deploys.find((d) => lower(d.environment) === "production") ?? null;
  const liveDeploy = production?.url ? production : (deploys.find((d) => d.url) ?? production ?? deploys[0] ?? null);
  const live = deploys.some((d) => d.state === "success");

  // Lines linked to this repo: Spend's own project filter.
  const filter = { project: [name], inbox: [] };
  const linked = input.lines.filter((l) => matchesFilters(l, filter));
  const totals = spendTotals(linked, currency);
  const countedIds = new Set(
    linked.filter((l) => l.scope === "work" && l.active && l.verified && l.monthlyCents !== null && l.monthlyCents > 0 && (l.currency ?? currency) === currency).map((l) => l.id),
  );
  const others = (l: PageLine) => l.projects.filter((p) => lower(p) !== lower(name));

  // Domains: custom deploy hosts, then domains in receipts that touch this repo.
  const deployDomains = new Set(deploys.map((d) => customDomainOf(d.url)).filter((d): d is string => Boolean(d)));
  const linkedReceiptIds = new Set(linked.flatMap((l) => l.receiptIds));
  const touching = input.receipts
    .map((r) => ({ r, why: receiptTouches(r, name, { linkedReceiptIds, deployDomains, repoNames: input.repoNames }) }))
    .filter((x): x is { r: PageReceipt; why: NonNullable<ReturnType<typeof receiptTouches>> } => x.why !== null);
  const domains = new Map<string, DomainRow>();
  for (const d of deployDomains) {
    domains.set(d, {
      name: d,
      seenIn: ["deploy"],
      live: deploys.some((x) => x.state === "success" && customDomainOf(x.url) === d),
      registrar: null,
      renewsAt: null,
      renewalCents: null,
      currency: null,
      receivedBy: null,
      billingUrl: null,
      source: "GitHub deployments",
    });
  }
  for (const { r, why } of touching) {
    for (const raw of r.domainNames) {
      const d = lower(raw).replace(/^www\./, "");
      if (!/\./.test(d)) continue;
      const row =
        domains.get(d) ??
        ({ name: d, seenIn: [], live: false, registrar: null, renewsAt: null, renewalCents: null, currency: null, receivedBy: null, billingUrl: null, source: `Mail: ${TOUCH_SOURCE[why]}` } as DomainRow);
      if (!row.seenIn.includes("receipt")) row.seenIn.push("receipt");
      if (row.source === "GitHub deployments") row.source = `GitHub deployments and mail`;
      // The renewal date only from a verified notice that states one; the latest stated date wins.
      if (r.verified && r.dueAt && ["renewal_notice", "domain_or_dns"].includes(r.kind) && (!row.renewsAt || r.dueAt > row.renewsAt)) {
        row.renewsAt = r.dueAt;
        row.renewalCents = r.amountCents;
        row.currency = r.currency;
        row.registrar = r.vendor;
        row.receivedBy = r.inbox;
        row.billingUrl = billingUrl(r.vendor);
      }
      if (!row.registrar && r.verified) {
        row.registrar = r.vendor;
        row.billingUrl = billingUrl(r.vendor);
      }
      domains.set(d, row);
    }
  }
  const domainRows = [...domains.values()].sort((a, b) => (a.renewsAt ?? "9").localeCompare(b.renewsAt ?? "9") || a.name.localeCompare(b.name));

  // Services and bills, grouped by category.
  const services: ServiceRow[] = linked.map((l) => ({
    id: l.id,
    vendor: l.vendor,
    vendorKey: l.vendorKey,
    plan: l.plan,
    category: CATEGORY_LABEL[l.category] ? l.category : "other",
    scope: l.scope,
    cadence: l.cadence,
    monthlyCents: l.monthlyCents,
    currency: l.currency,
    active: l.active,
    verified: l.verified,
    counted: countedIds.has(l.id),
    owner: l.accountEmails[0] ?? l.inbox,
    inbox: l.inbox,
    sharedWith: others(l),
    lastBilledAt: l.lastBilledAt,
    receipts: l.receipts,
    billingUrl: billingUrl(l.vendor),
    source: `${l.receipts === 1 ? "1 receipt" : `${l.receipts} receipts`} in ${l.inbox}`,
  }));
  const groups: ServiceGroup[] = CATEGORY_ORDER.map((c) => ({
    category: c,
    label: CATEGORY_LABEL[c],
    services: services.filter((s) => s.category === c).sort((a, b) => (b.monthlyCents ?? -1) - (a.monthlyCents ?? -1)),
  })).filter((g) => g.services.length);

  // Stack: language from GitHub, hosts from deploys and hosting bills, services from bills.
  const hosts = new Map<string, { name: string; seenIn: ("deploys" | "bills")[] }>();
  for (const d of deploys) {
    if (!d.provider || d.provider === "GitHub Actions") continue;
    const h = hosts.get(norm(d.provider)) ?? { name: d.provider, seenIn: [] };
    if (!h.seenIn.includes("deploys")) h.seenIn.push("deploys");
    hosts.set(norm(d.provider), h);
  }
  for (const s of services) {
    if (s.category !== "hosting") continue;
    const h = hosts.get(norm(s.vendor)) ?? { name: s.vendor, seenIn: [] };
    if (!h.seenIn.includes("bills")) h.seenIn.push("bills");
    hosts.set(norm(s.vendor), h);
  }
  const stackServices = groups
    .filter((g) => g.category !== "hosting")
    .map((g) => ({ category: g.category, label: g.label, vendors: [...new Set(g.services.map((s) => s.vendor))] }));

  const recommendations = recommend({ input, deploys, linked, countedIds, domainRows, touching: touching.map((t) => t.r), others });

  const counted = linked.filter((l) => countedIds.has(l.id));
  return {
    project: {
      ...repo,
      owner,
      repo: rest.join("/") || name,
      liveUrl: liveDeploy?.url ?? null,
      live,
      host: liveDeploy?.provider ?? null,
    },
    stack: {
      language: repo.language,
      hosts: [...hosts.values()],
      services: stackServices,
      source: "From repo metadata and bills",
    },
    cogs: {
      monthlyCents: totals.monthlyCents,
      currency,
      bills: counted.length,
      sources: [...new Set(counted.map((l) => l.inbox))],
      shared: counted
        .filter((l) => others(l).length)
        .map((l) => ({ vendor: l.vendor, plan: l.plan, monthlyCents: l.monthlyCents as number, otherProjects: others(l) })),
      unknownMonthlyCents: totals.unknownMonthlyCents,
      personalMonthlyCents: totals.personalMonthlyCents,
      otherCurrencies: totals.otherCurrencies,
      notCounted: linked.filter((l) => !l.active || !l.verified || l.monthlyCents === null).length,
      spendPath: `/app/findings?project=${encodeURIComponent(name)}`,
      source: "Spend's math: work bills linked to this repo, pre-tax, annual plans spread per month",
    },
    deployments: deploys.map((d) => ({ ...d, source: "GitHub deployments" })),
    domains: domainRows,
    services: groups,
    recommendations,
    notObserved: ["traffic", "database activity", "env var and key names", "framework"],
  };
}

// ---------- Recommendations ----------

type RecCtx = {
  input: ProjectPageInput;
  deploys: PageDeployment[];
  linked: PageLine[];
  countedIds: Set<string>;
  domainRows: DomainRow[];
  touching: PageReceipt[];
  others: (l: PageLine) => string[];
};

const lineLabel = (l: Pick<PageLine, "vendor" | "plan">) => `${l.vendor}${l.plan ? ` ${l.plan}` : ""}`;
const lineValue = (l: PageLine, currency: string) =>
  `${lineLabel(l)}${l.monthlyCents !== null ? `, ${money(l.monthlyCents, l.currency ?? currency)}/mo` : ""}`;
const deployValue = (d: PageDeployment) => `${d.environment.charAt(0).toUpperCase() + d.environment.slice(1)}${hostOf(d.url) ? ` ${hostOf(d.url)}` : ""}${d.state ? `, ${d.state === "success" ? "live" : d.state}` : ""}`;

function billRow(l: PageLine, currency: string): EvidenceRow {
  return { label: "Bill", value: lineValue(l, currency), at: l.lastBilledAt, source: `receipts in ${l.inbox}` };
}

/** Open findings that touch this repo, then the project rules, biggest amount first. */
export function recommend(ctx: RecCtx): Recommendation[] {
  const { input, deploys, linked, countedIds, domainRows, touching, others } = ctx;
  const { repo, currency, nowMs } = input;
  const short = shortName(repo.name);

  // 1. Findings from the account-wide engine that rest on this repo's lines, notices or name.
  const receiptIds = new Set([...linked.flatMap((l) => l.receiptIds), ...touching.map((r) => r.id)]);
  const touches = (f: PageFinding) => f.evidence.receiptIds.some((id) => receiptIds.has(id)) || (f.evidence.repo ? lower(f.evidence.repo) === lower(repo.name) : false);
  const mine = input.findings.filter(touches);
  /** Receipts a finding already speaks for, any status: a dismissed finding keeps a project rule quiet too. */
  const covered = new Set(mine.flatMap((f) => f.evidence.receiptIds));
  const isCovered = (ids: string[]) => ids.some((id) => covered.has(id));

  const out: Recommendation[] = mine
    .filter((f) => f.status !== "dismissed")
    .map((f) => ({
      id: f.id,
      source: "finding" as const,
      kind: f.kind,
      title: f.title,
      action: f.action,
      amountCents: f.amountCents,
      currency: f.currency,
      per: f.kind === "expiring" ? ("renewal" as const) : ("month" as const),
      dueAt: f.kind === "expiring" ? (touching.find((r) => f.evidence.receiptIds.includes(r.id))?.dueAt ?? null) : null,
      vendor:
        linked.find((l) => l.receiptIds.some((id) => f.evidence.receiptIds.includes(id)))?.vendor ??
        touching.find((r) => f.evidence.receiptIds.includes(r.id))?.vendor ??
        null,
      billingUrl: f.actionUrl ?? null,
      evidence: [
        ...f.evidence.subjects.slice(0, 3).map((s) => ({ label: "Email", value: s, at: null, source: `mail to ${f.evidence.inbox ?? "your inbox"}` })),
        ...(f.evidence.repo && f.evidence.lastActivityAt ? [{ label: "Last push", value: f.evidence.repo, at: f.evidence.lastActivityAt, source: "GitHub" }] : []),
      ],
    }));

  const latest = deploys.filter((d) => d.at).sort((a, b) => (b.at as string).localeCompare(a.at as string))[0] ?? null;
  const pushRow: EvidenceRow[] = repo.lastPushAt ? [{ label: "Last push", value: repo.name, at: repo.lastPushAt, source: "GitHub" }] : [];
  const counted = linked.filter((l) => countedIds.has(l.id));

  // 2. Paid host or database, no deploy in 90 (host) or 120 (database) days. Needs at least one
  // deploy on record, so "no deploy" is a fact from GitHub, not an absence of data. Lines that
  // also pay for other repos are left out: one quiet repo does not make a shared plan idle.
  if (latest?.at) {
    const idle = days(latest.at, nowMs);
    for (const l of counted) {
      const limit = l.category === "hosting" ? IDLE_HOST_DAYS : l.category === "database" ? IDLE_DATABASE_DAYS : null;
      if (limit === null || idle < limit || others(l).length || isCovered(l.receiptIds)) continue;
      out.push({
        id: `idle_paid_infra:${l.id}`,
        source: "project",
        kind: "idle_paid_infra",
        title: `${lineLabel(l)} is still billed; ${short} has not deployed in ${idle} days`,
        action: `If ${short} is done, downgrade or cancel ${l.vendor} to save ${money(l.monthlyCents as number, l.currency ?? currency)}/mo.`,
        amountCents: l.monthlyCents,
        currency: l.currency ?? currency,
        per: "month",
        dueAt: null,
        vendor: l.vendor,
        billingUrl: billingUrl(l.vendor),
        evidence: [billRow(l, currency), { label: "Last deploy", value: deployValue(latest), at: latest.at, source: "GitHub deployments" }, ...pushRow],
      });
    }
  }

  // 3. A domain renewing within 60 days while nothing for this repo is live.
  const live = deploys.some((d) => d.state === "success");
  if (!live) {
    for (const d of domainRows) {
      if (!d.renewsAt) continue;
      const until = Math.ceil((Date.parse(d.renewsAt) - nowMs) / DAY);
      if (until < 0 || until > RENEWAL_WINDOW_DAYS) continue;
      const notice = touching.find((r) => r.dueAt === d.renewsAt && r.domainNames.some((n) => lower(n).replace(/^www\./, "") === d.name));
      const deployRow: EvidenceRow = latest
        ? { label: "Last deploy", value: deployValue(latest), at: latest.at, source: "GitHub deployments" }
        : { label: "Deploys", value: "none reported for this repo", at: null, source: "GitHub deployments" };
      // An expiring finding already names this renewal: add the deploy fact to it rather than repeat it.
      const existing = notice ? out.find((r) => r.source === "finding" && r.kind === "expiring" && mine.find((f) => f.id === r.id)?.evidence.receiptIds.includes(notice.id)) : null;
      if (existing) {
        existing.evidence.push(deployRow);
        continue;
      }
      if (notice && covered.has(notice.id)) continue;
      out.push({
        id: `renewal_without_deploy:${d.name}:${d.renewsAt.slice(0, 10)}`,
        source: "project",
        kind: "renewal_without_deploy",
        title: `${d.name} renews in ${until} ${until === 1 ? "day" : "days"}; nothing for ${short} is live`,
        action: `If ${d.name} has no other use, turn off auto-renew${d.registrar ? ` at ${d.registrar}` : ""} before it renews.`,
        amountCents: d.renewalCents,
        currency: d.currency ?? currency,
        per: "renewal",
        dueAt: d.renewsAt,
        vendor: d.registrar,
        billingUrl: d.billingUrl,
        evidence: [
          {
            label: "Renewal",
            value: `${d.name}${d.renewalCents !== null ? `, ${money(d.renewalCents, d.currency ?? currency)}` : ""}${d.registrar ? ` at ${d.registrar}` : ""}`,
            at: d.renewsAt,
            source: `notice in ${d.receivedBy ?? "your inbox"}`,
          },
          deployRow,
        ],
      });
    }
  }

  // 4. Two or more hosts billed for one repo. The one production does not deploy to is the
  // candidate; when production says nothing, both are listed and no amount is claimed.
  const hostLines = counted.filter((l) => l.category === "hosting");
  const hostVendors = [...new Set(hostLines.map((l) => l.vendorKey))];
  if (hostVendors.length >= 2 && !hostLines.every((l) => isCovered(l.receiptIds))) {
    const prod = deploys.find((d) => lower(d.environment) === "production" && d.state === "success" && d.provider) ?? null;
    const prodKey = prod?.provider ? norm(prod.provider) : null;
    const spare = prodKey ? hostLines.filter((l) => norm(l.vendor) !== prodKey && l.vendorKey !== prodKey) : [];
    const candidate = spare.length === hostLines.length ? null : (spare.filter((l) => !others(l).length).sort((a, b) => (b.monthlyCents ?? 0) - (a.monthlyCents ?? 0))[0] ?? null);
    const names = [...new Set(hostLines.map((l) => l.vendor))];
    const lastDeployFrom = (vendor: string) =>
      deploys.filter((d) => d.provider && norm(d.provider) === norm(vendor) && d.at).sort((a, b) => (b.at as string).localeCompare(a.at as string))[0] ?? null;
    out.push({
      id: `two_hosts:${hostVendors.sort().join("+")}`,
      source: "project",
      kind: "two_hosts",
      title: `${COUNT_WORD[names.length] ?? names.length} hosts billed for ${short}: ${names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join(" and ")}`,
      action: candidate
        ? `Production deploys to ${prod?.provider}. If ${candidate.vendor} no longer serves ${short}, cancel it to save ${money(candidate.monthlyCents as number, candidate.currency ?? currency)}/mo.`
        : `Check which host still serves ${short}; one is usually enough.`,
      amountCents: candidate?.monthlyCents ?? null,
      currency: candidate?.currency ?? currency,
      per: "month",
      dueAt: null,
      vendor: candidate?.vendor ?? null,
      billingUrl: candidate ? billingUrl(candidate.vendor) : null,
      evidence: hostLines.flatMap((l) => {
        const d = lastDeployFrom(l.vendor);
        return [
          billRow(l, currency),
          d
            ? { label: "Last deploy", value: `${deployValue(d)} via ${l.vendor}`, at: d.at, source: "GitHub deployments" }
            : { label: "Deploys", value: `none reported from ${l.vendor}`, at: null, source: "GitHub deployments" },
        ];
      }),
      hosts: hostLines.map((l) => {
        const d = lastDeployFrom(l.vendor);
        return {
          name: lineLabel(l),
          vendor: l.vendor,
          monthlyCents: l.monthlyCents,
          currency: l.currency ?? currency,
          production: Boolean(prodKey) && (norm(l.vendor) === prodKey || l.vendorKey === prodKey),
          candidate: candidate?.id === l.id,
          bill: billRow(l, currency),
          deploy: d
            ? { label: "Last deploy", value: deployValue(d), at: d.at, source: "GitHub deployments" }
            : { label: "Deploys", value: "none reported", at: null, source: "GitHub deployments" },
          billingUrl: billingUrl(l.vendor),
        };
      }),
    });
  }

  // Biggest first, a renewal weighed as a twelfth of itself so a yearly domain does not outrank a monthly plan.
  const weight = (r: Recommendation) => (r.amountCents === null ? -1 : r.per === "renewal" ? r.amountCents / 12 : r.amountCents);
  return out.sort((a, b) => weight(b) - weight(a));
}
