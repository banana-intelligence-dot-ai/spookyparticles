/**
 * Development-only Spend and Findings fixtures, in exactly the API's shapes. Inboxes at
 * example.com, repos under octocat and hubot. Every scope, cadence and state appears once; one line pays
 * for two repos, one repo has two lines, and one vendor bills an address that is not the inbox.
 */
import type { Finding, Spend, Subscription } from "@/app/app/data-model";
import { NOW } from "./fixtures";

const DAY = 86_400_000;
const at = (days: number) => new Date(NOW - days * DAY).toISOString();
const ahead = (days: number) => new Date(NOW + days * DAY).toISOString();
const YOU = "you@example.com";
const BILLING = "billing@example.com";

type Over = Partial<Subscription> & Pick<Subscription, "vendor" | "monthlyCents">;

let n = 0;
function sub(over: Over): Subscription {
  n += 1;
  const key = over.vendor.toLowerCase().replace(/[^a-z0-9]/g, "");
  return {
    id: `${key}:${n}`,
    vendorKey: key,
    category: "saas",
    scope: "work",
    plan: null,
    inbox: YOU,
    inboxes: [over.inbox ?? YOU],
    cadence: "monthly",
    currency: "USD",
    lastBilledAt: at(10),
    nextExpectedAt: ahead(20),
    receipts: 6,
    verified: true,
    active: true,
    projectNames: [],
    accountEmails: [],
    projects: [],
    receiptIds: [],
    ...over,
  };
}

const SUBS: Subscription[] = [
  sub({ vendor: "Anthropic", plan: "Max", category: "ai", monthlyCents: 20000, lastBilledAt: at(19), nextExpectedAt: ahead(11), receipts: 9 }),
  sub({ vendor: "Vercel", plan: "Pro, 2 teams", category: "hosting", monthlyCents: 4000, inboxes: [YOU, BILLING], lastBilledAt: at(5), nextExpectedAt: ahead(25), receipts: 20, projectNames: ["ledger-api", "edge-proxy"], projects: ["octocat/ledger-api", "octocat/edge-proxy"], receiptIds: ["rcpt_1b9e33", "rcpt_0c4f12"] }),
  sub({ vendor: "Namecheap", plan: "example.com", category: "domains", cadence: "annual", monthlyCents: 1583, lastBilledAt: at(347), nextExpectedAt: ahead(18), receipts: 3 }),
  sub({ vendor: "OpenAI", category: "ai", cadence: "usage", monthlyCents: 3742, lastBilledAt: at(2), nextExpectedAt: ahead(28), receipts: 9, accountEmails: ["api@example.com"] }),
  sub({ vendor: "Supabase", plan: "Pro", category: "database", inbox: BILLING, inboxes: [BILLING], monthlyCents: 2500, lastBilledAt: at(11), nextExpectedAt: ahead(19), receipts: 11, projectNames: ["billing-web"], projects: ["octocat/billing-web"], receiptIds: ["rcpt_aa3190"] }),
  sub({ vendor: "Sentry", plan: "Team", category: "dev_tools", inbox: BILLING, inboxes: [BILLING], monthlyCents: 2600, lastBilledAt: at(30), nextExpectedAt: ahead(1), receipts: 10, projectNames: ["ledger-api"], projects: ["octocat/ledger-api"] }),
  sub({ vendor: "Twilio", category: "saas", cadence: "usage", monthlyCents: 2230, lastBilledAt: at(8), nextExpectedAt: ahead(22), receipts: 12, projectNames: ["notify-cli"], projects: ["hubot/notify-cli"], receiptIds: ["rcpt_8f2a01", "rcpt_77c1d4"] }),
  sub({ vendor: "GitHub", plan: "Copilot Pro", category: "dev_tools", monthlyCents: 1000, lastBilledAt: at(3), nextExpectedAt: ahead(27), receipts: 12 }),
  sub({ vendor: "Render", plan: "Starter", category: "hosting", inbox: BILLING, inboxes: [BILLING], monthlyCents: 1137, lastBilledAt: at(16), nextExpectedAt: ahead(14), receipts: 7, projectNames: ["queue-worker"], projects: ["octocat/queue-worker"] }),
  sub({ vendor: "Fly.io", category: "hosting", inbox: BILLING, inboxes: [BILLING], cadence: "usage", monthlyCents: 700, lastBilledAt: at(8), nextExpectedAt: ahead(22), receipts: 5, projectNames: ["export-service"], projects: ["hubot/export-service"], receiptIds: ["rcpt_5d0a77"] }),
  sub({ vendor: "Cloudflare", plan: "Workers Paid", category: "dns_cdn", inbox: BILLING, inboxes: [BILLING], monthlyCents: 500, lastBilledAt: at(18), nextExpectedAt: ahead(12), receipts: 8, projectNames: ["status-site"], projects: ["hubot/status-site"] }),
  sub({ vendor: "Railway", plan: "Hobby", category: "hosting", monthlyCents: 500, lastBilledAt: at(12), nextExpectedAt: ahead(18), receipts: 4, projectNames: ["notify-cli"], projects: ["hubot/notify-cli"] }),
  sub({ vendor: "Hetzner", plan: "CX22", category: "hosting", currency: "EUR", monthlyCents: 459, lastBilledAt: at(6), nextExpectedAt: ahead(24), receipts: 5 }),
  sub({ vendor: "Vercel", plan: "Pro", category: "hosting", inbox: "ops@example.com", inboxes: ["ops@example.com"], monthlyCents: 9900, lastBilledAt: at(2), nextExpectedAt: null, receipts: 1, verified: false }),
  // Unsorted: nobody has said yet.
  sub({ vendor: "Raycast", plan: "Pro", scope: "unknown", category: "other", monthlyCents: 800, lastBilledAt: at(14), nextExpectedAt: ahead(16), receipts: 6 }),
  sub({ vendor: "Readwise", scope: "unknown", category: "other", cadence: "annual", monthlyCents: 917, lastBilledAt: at(200), nextExpectedAt: ahead(165), receipts: 2 }),
  sub({ vendor: "Setapp", scope: "unknown", category: "other", monthlyCents: 1299, lastBilledAt: at(21), nextExpectedAt: ahead(9), receipts: 8 }),
  // Personal: listed, never summed.
  sub({ vendor: "Spotify", plan: "Family", scope: "personal", category: "other", monthlyCents: 1999, lastBilledAt: at(7), nextExpectedAt: ahead(23), receipts: 24 }),
  sub({ vendor: "AppleCare", scope: "personal", category: "other", monthlyCents: 999, lastBilledAt: at(4), nextExpectedAt: ahead(26), receipts: 12 }),
  sub({ vendor: "Google One", plan: "2 TB", scope: "personal", category: "other", monthlyCents: 999, lastBilledAt: at(9), nextExpectedAt: ahead(21), receipts: 18 }),
  // Stopped billing.
  sub({ vendor: "Heroku", plan: "Eco", category: "hosting", active: false, monthlyCents: null, lastBilledAt: at(220), nextExpectedAt: null, receipts: 14 }),
  sub({ vendor: "Linear", plan: "Standard", category: "dev_tools", active: false, monthlyCents: null, lastBilledAt: at(95), nextExpectedAt: null, receipts: 6 }),
];

const cur = "USD";
const live = (s: Subscription) => s.active && s.verified && s.monthlyCents !== null && s.currency === cur;
const sum = (list: Subscription[]) => list.reduce((a, s) => a + (s.monthlyCents ?? 0), 0);

export const SPEND: Spend = {
  currency: cur,
  monthlyCents: sum(SUBS.filter((s) => live(s) && s.scope === "work")),
  personalMonthlyCents: sum(SUBS.filter((s) => live(s) && s.scope === "personal")),
  unknownMonthlyCents: sum(SUBS.filter((s) => live(s) && s.scope === "unknown")),
  byCategory: [],
  otherCurrencies: [{ currency: "EUR", monthlyCents: 459, count: 1 }],
  activeCount: SUBS.filter((s) => s.active).length,
  lapsedCount: SUBS.filter((s) => !s.active).length,
  unverified: SUBS.filter((s) => !s.verified).length,
  subscriptions: SUBS,
};

export const FINDINGS: Finding[] = [
  {
    id: "f1",
    kind: "zombie",
    title: "Twilio: hubot/notify-cli, no push in 210 days",
    amountCents: 2230,
    currency: "USD",
    confidence: 0.86,
    status: "open",
    action: "Release the phone number and close the Twilio project if nothing else uses it.",
    actionUrl: "https://console.twilio.com/us1/billing",
    evidence: {
      inbox: YOU,
      subjects: ["Your Twilio invoice for October 2026", "Your Twilio invoice for September 2026"],
      receiptIds: ["rcpt_8f2a01", "rcpt_77c1d4"],
      repo: "hubot/notify-cli",
      lastActivityAt: at(210),
    },
    computedAt: at(0.1),
  },
  {
    id: "f2",
    kind: "duplicate_plan",
    title: "Vercel Pro is paid on two teams, one per inbox",
    amountCents: 2000,
    currency: "USD",
    confidence: 0.93,
    status: "open",
    action: "If both are the same team, cancel the plan billed to billing@example.com.",
    actionUrl: "https://vercel.com/account/billing",
    evidence: {
      inbox: BILLING,
      subjects: ["Your Vercel receipt for October 2026", "Your Vercel receipt for September 2026"],
      receiptIds: ["rcpt_1b9e33", "rcpt_0c4f12"],
    },
    computedAt: at(0.1),
  },
  {
    id: "f3",
    kind: "zombie",
    title: "Fly.io: hubot/export-service, no push in 210 days",
    amountCents: 700,
    currency: "USD",
    confidence: 0.78,
    status: "open",
    action: "Scale the app to zero in Fly.io. The volume stays.",
    actionUrl: "https://fly.io/dashboard/personal/billing",
    evidence: { inbox: BILLING, subjects: ["Fly.io invoice"], receiptIds: ["rcpt_5d0a77"], repo: "hubot/export-service", lastActivityAt: at(210) },
    computedAt: at(0.1),
  },
  {
    id: "f4",
    kind: "expired_card",
    title: "Supabase could not charge the card on file",
    amountCents: 2500,
    currency: "USD",
    confidence: 0.97,
    status: "open",
    action: "Update the card in Supabase billing before the plan lapses.",
    actionUrl: "https://supabase.com/dashboard/org/_/billing",
    evidence: { inbox: YOU, subjects: ["Your payment for Supabase Pro failed"], receiptIds: ["rcpt_aa3190"] },
    computedAt: at(0.1),
  },
  {
    id: "f5",
    kind: "zombie",
    title: "Render: octocat/cache-proxy, no push in 365 days",
    amountCents: null,
    currency: "USD",
    confidence: 0.6,
    status: "dismissed",
    action: "Archive the repo on GitHub.",
    evidence: { inbox: null, subjects: [], receiptIds: [], repo: "octocat/cache-proxy", lastActivityAt: at(388) },
    computedAt: at(0.1),
  },
];
