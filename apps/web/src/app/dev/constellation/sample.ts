/**
 * One sample account, shared by the three landing-chart directions. It is what a user
 * sees after connecting GitHub and one Gmail inbox: repos (GitHub), where each deploys
 * and the domain it answers on (GitHub deployments), and bills (Gmail receipts).
 * Names use the reserved .example domain and a "you/" login so nothing reads as real.
 */
export const SAMPLE_NOW = Date.parse("2026-11-01T12:00:00Z");

export type Bill = { vendor: string; plan: string; cents: number };

export type SampleProject = {
  repo: string;
  /** Days since the last push. */
  pushed: number;
  host: string | null;
  deploy: "live" | "failed" | null;
  deployNote: string | null;
  /** The custom domain the deploy answers on, or null when it only has the host's URL. */
  domain: string | null;
  domainNote: string | null;
  /** True when the domain needs the user (a renewal notice in the inbox). */
  domainDue: boolean;
  bills: Bill[];
  /** Grey "worth a look": paid, untouched for months. */
  idlePaid: boolean;
};

export const PROJECTS: SampleProject[] = [
  {
    repo: "you/shop-api",
    pushed: 0.05,
    host: "Render",
    deploy: "failed",
    deployNote: "failed 2h ago",
    domain: "api.shop.example",
    domainNote: null,
    domainDue: false,
    bills: [{ vendor: "Render", plan: "Starter", cents: 700 }],
    idlePaid: false,
  },
  {
    repo: "you/shop",
    pushed: 2,
    host: "Vercel",
    deploy: "live",
    deployNote: "live",
    domain: "shop.example",
    domainNote: null,
    domainDue: false,
    bills: [
      { vendor: "Vercel", plan: "Pro", cents: 2000 },
      { vendor: "Supabase", plan: "Pro", cents: 2500 },
    ],
    idlePaid: false,
  },
  {
    repo: "you/scheduler",
    pushed: 21,
    host: "Fly.io",
    deploy: "live",
    deployNote: "live",
    domain: null,
    domainNote: "fly.dev address only",
    domainDue: false,
    bills: [],
    idlePaid: false,
  },
  {
    repo: "you/blog-2024",
    pushed: 420,
    host: "Netlify",
    deploy: "live",
    deployNote: "live",
    domain: "blog.example",
    domainNote: "renews in 9 days",
    domainDue: true,
    bills: [{ vendor: "Netlify", plan: "Pro", cents: 1900 }],
    idlePaid: true,
  },
];

/** A receipt in the inbox that no repo deploys to. */
export const ORPHAN: Bill & { note: string } = { vendor: "Railway", plan: "Hobby", cents: 500, note: "no repo deploys here" };

/** Repos with nothing deployed and nothing billed: most of a real account. */
export const QUIET_REPOS = 37;

export const projectCents = (p: SampleProject) => p.bills.reduce((a, b) => a + b.cents, 0);
export const TOTAL_CENTS = PROJECTS.reduce((a, p) => a + projectCents(p), 0) + ORPHAN.cents;

export const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export function ago(days: number) {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h ago`;
  if (days < 14) return `${Math.round(days)}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)} mo ago`;
}

/** Deterministic ages for the quiet repos, spread like a real account (a few recent, a long tail). */
export function quietAges(): number[] {
  let s = 1947;
  const r = () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
  return Array.from({ length: QUIET_REPOS }, () => {
    const x = r();
    return x < 0.15 ? r() * 10 : x < 0.35 ? 10 + r() * 50 : x < 0.6 ? 60 + r() * 200 : 260 + r() * 470;
  });
}

/** Last push on a log axis: today at 0, two years at 1. */
export const TICKS = [
  { d: 0, label: "today" },
  { d: 7, label: "1 week" },
  { d: 30, label: "1 month" },
  { d: 90, label: "3 months" },
  { d: 365, label: "1 year" },
  { d: 730, label: "2 years" },
];
export const ageT = (d: number) => Math.log1p(Math.min(d, 730)) / Math.log1p(730);
