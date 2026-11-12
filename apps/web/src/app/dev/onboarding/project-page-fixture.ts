/**
 * Development-only: one rich project page, built by the real builder from fake inputs.
 * octocat/billing-web runs on two hosts (production on Vercel, an old Netlify site), answers
 * on billing.example.com, which renews in 18 days, uses a Supabase database, and has three
 * bills, one of them (Vercel Pro) shared with two other repos. Inboxes at example.com.
 */
import { buildProjectPage, type PageFinding, type PageLine, type PageReceipt, type ProjectPageInput } from "@/lib/project-page";
import { NOW } from "./fixtures";

const H = 3_600_000;
const D = 24 * H;
const at = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const YOU = "you@example.com";
const BILLING = "billing@example.com";
const NAME = "octocat/billing-web";

function line(over: Partial<PageLine> & Pick<PageLine, "id" | "vendor" | "category" | "monthlyCents" | "projects">): PageLine {
  return {
    vendorKey: over.vendor.toLowerCase().replace(/[^a-z0-9]/g, ""),
    scope: "work",
    active: true,
    verified: true,
    currency: "USD",
    inbox: YOU,
    inboxes: [over.inbox ?? YOU],
    accountEmails: [],
    plan: null,
    cadence: "monthly",
    lastBilledAt: at(9 * D),
    receipts: 6,
    receiptIds: [],
    ...over,
  };
}

const LINES: PageLine[] = [
  line({ id: "vercel:1", vendor: "Vercel", category: "hosting", plan: "Pro", monthlyCents: 2000, projects: [NAME, "octocat/ledger-api", "hubot/docs-site"], receiptIds: ["r-vercel-1", "r-vercel-2"], lastBilledAt: at(4 * D), receipts: 11 }),
  line({ id: "netlify:2", vendor: "Netlify", category: "hosting", plan: "Pro", monthlyCents: 1900, projects: [NAME], receiptIds: ["r-netlify-1"], inbox: BILLING, inboxes: [BILLING], lastBilledAt: at(12 * D), receipts: 14 }),
  line({ id: "supabase:3", vendor: "Supabase", category: "database", plan: "Pro", monthlyCents: 2500, projects: [NAME], receiptIds: ["r-supa-1"], accountEmails: ["ops@example.com"], lastBilledAt: at(6 * D), receipts: 9 }),
  // Another repo's bill: never on this page.
  line({ id: "render:4", vendor: "Render", category: "hosting", plan: "Starter", monthlyCents: 700, projects: ["octocat/queue-worker"] }),
];

const RECEIPTS: PageReceipt[] = [
  {
    id: "r-domain-renew",
    kind: "renewal_notice",
    vendor: "Namecheap",
    amountCents: 7000,
    currency: "USD",
    at: at(3 * D),
    dueAt: ahead(18 * D),
    projectNames: [],
    domainNames: ["billing.example.com"],
    inbox: YOU,
    subject: "Your domain billing.example.com renews soon",
    verified: true,
  },
];

const FINDINGS: PageFinding[] = [
  {
    id: "f-expiring-billing",
    kind: "expiring",
    title: "billing.example.com renews in 18 days for $70",
    action: "Decide before it renews: keep it, or cancel at Namecheap.",
    amountCents: 7000,
    currency: "USD",
    status: "open",
    actionUrl: "https://ap.www.namecheap.com/domains/list/",
    evidence: { inbox: YOU, subjects: ["Your domain billing.example.com renews soon"], receiptIds: ["r-domain-renew"] },
  },
];

export const PROJECT_PAGE_INPUT: ProjectPageInput = {
  repo: {
    id: "p03",
    name: NAME,
    url: "https://github.com/octocat/billing-web",
    private: true,
    defaultBranch: "main",
    language: "TypeScript",
    status: "active",
    lastPushAt: at(2 * D + 5 * H),
    health: "attention",
  },
  deployments: [
    { environment: "Production", state: "success", url: "https://billing.example.com", at: at(2 * D + 4 * H), provider: "Vercel", creator: "vercel[bot]" },
    { environment: "Preview", state: "success", url: "https://billing-web-git-main-octocat.vercel.app", at: at(2 * D + 5 * H), provider: "Vercel", creator: "vercel[bot]" },
    { environment: "staging", state: "inactive", url: "https://billing-web.netlify.app", at: at(143 * D), provider: "Netlify", creator: "netlify[bot]" },
  ],
  lines: LINES,
  receipts: RECEIPTS,
  findings: FINDINGS,
  repoNames: [NAME, "octocat/ledger-api", "hubot/docs-site", "octocat/queue-worker"],
  currency: "USD",
  nowMs: NOW,
};

export const PROJECT_PAGE = buildProjectPage(PROJECT_PAGE_INPUT);
