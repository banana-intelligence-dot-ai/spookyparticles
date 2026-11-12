/**
 * Labeled emails for the extraction eval. These are written by hand in the shape real vendor emails take;
 * none is a real message and none contains a real person's data. Real labeled
 * examples would be added only with the owner's consent.
 *
 * Each case is an EmailText plus the expected record fields the gate checks.
 */
import type { EmailText } from "@/lib/gmail/body";
import type { ReceiptKind } from "@/db/schema";

export type EvalCase = {
  id: string;
  email: EmailText;
  expect: {
    type: ReceiptKind;
    vendor: string;
    amountCents: number | null;
    currency: string | null;
    billedAt?: string | null;
    dueAt?: string | null;
    plan?: string | null;
    cadence?: "monthly" | "annual" | "usage" | "one_time" | "unknown";
    projectNames?: string[];
    domainNames?: string[];
    invoiceId?: string | null;
  };
};

const verified = { dkim: "pass", dmarc: "pass", spf: "pass", dkimDomain: null, verified: true } as const;
const unverified = { dkim: "fail", dmarc: "fail", spf: "none", dkimDomain: null, verified: false } as const;

function email(over: Omit<Partial<EmailText>, "date"> & { from: string; subject: string; text: string; date: string }): EmailText {
  const addr = /<([^>]+)>/.exec(over.from)?.[1] ?? over.from;
  return {
    from: over.from,
    fromAddress: addr.toLowerCase(),
    fromDomain: addr.split("@")[1]?.toLowerCase() ?? null,
    replyTo: over.replyTo ?? null,
    subject: over.subject,
    date: new Date(over.date),
    text: over.text,
    html: over.html ?? null,
    attachmentNames: over.attachmentNames ?? [],
    auth: over.auth ?? verified,
  };
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "vercel-pro-monthly",
    email: email({
      from: "Vercel <invoice+statements@vercel.com>",
      subject: "Your receipt from Vercel #2847-1193",
      date: "2026-10-01T08:12:00Z",
      text: `Receipt from Vercel\n\nAmount paid $20.00\nDate paid October 1, 2026\nPayment method Visa ending 4242\n\nSummary\nPro plan, team "spooky-particles"\nOct 1 to Oct 31, 2026\n1 × Pro seat $20.00\n\nSubtotal $20.00\nTax $0.00\nAmount paid $20.00\n\nReceipt number 2847-1193\nQuestions? Contact support@vercel.com`,
    }),
    expect: { type: "receipt", vendor: "Vercel", amountCents: 2000, currency: "USD", billedAt: "2026-10-01", plan: "Pro", cadence: "monthly", projectNames: ["spooky-particles"], invoiceId: "2847-1193" },
  },
  {
    id: "supabase-pro-with-tax",
    email: email({
      from: "Supabase <billing@supabase.com>",
      subject: "Your Supabase invoice is available",
      date: "2026-10-05T14:00:00Z",
      text: `Hi,\n\nYour invoice for the billing period Sep 5 to Oct 5, 2026 is ready.\n\nOrganization: Banana Intelligence\nPlan: Pro\nSubtotal: $25.00\nSales tax (8.875%): $2.22\nTotal: $27.22\nCharged to card ending 4242 on October 5, 2026.\nInvoice ID: INV-77A2C1\n\nThanks,\nThe Supabase team`,
    }),
    expect: { type: "receipt", vendor: "Supabase", amountCents: 2500, currency: "USD", billedAt: "2026-10-05", plan: "Pro", cadence: "monthly", invoiceId: "INV-77A2C1" },
  },
  {
    id: "github-team-annual",
    email: email({
      from: "GitHub <billing@github.com>",
      subject: "[GitHub] Payment receipt for banana-intelligence",
      date: "2026-09-12T02:30:00Z",
      text: `Thanks for your payment.\n\nOrganization: banana-intelligence\nPlan: Team (annual)\nSeats: 3\nAmount: $144.00 USD\nBilling period: September 12, 2026 to September 12, 2027\nTransaction ID: GH-9f81c2\n\nView your billing settings at https://github.com/organizations/banana-intelligence/settings/billing`,
    }),
    expect: { type: "receipt", vendor: "GitHub", amountCents: 14400, currency: "USD", billedAt: "2026-09-12", plan: "Team", cadence: "annual", projectNames: ["banana-intelligence"], invoiceId: "GH-9f81c2" },
  },
  {
    id: "cloudflare-domain-renewal-notice",
    email: email({
      from: "Cloudflare <noreply@notify.cloudflare.com>",
      subject: "Your domain spookyparticles.ai will auto-renew",
      date: "2026-10-20T09:00:00Z",
      text: `Hello,\n\nThis is a reminder that spookyparticles.ai is set to auto-renew on November 18, 2026 for $70.00 (1 year). Your card ending 4242 will be charged.\n\nTo change your renewal settings, visit the Cloudflare dashboard → Domain Registration.\n\nCloudflare, Inc.`,
    }),
    expect: { type: "domain_or_dns", vendor: "Cloudflare", amountCents: 7000, currency: "USD", dueAt: "2026-11-18", domainNames: ["spookyparticles.ai"], cadence: "annual" },
  },
  {
    id: "namecheap-renewal-notice",
    email: email({
      from: "Namecheap <support@namecheap.com>",
      subject: "Renewal reminder: 1 domain expires in 30 days",
      date: "2026-10-15T12:00:00Z",
      text: `Dear customer,\n\nThe following domain is due for renewal:\n\nmyhappenings.app expires on 2026-11-14. Renewal price: $18.98 USD.\n\nAuto-renew is OFF for this domain. Renew now to keep it.\n\nNamecheap`,
    }),
    expect: { type: "domain_or_dns", vendor: "Namecheap", amountCents: 1898, currency: "USD", dueAt: "2026-11-14", domainNames: ["myhappenings.app"] },
  },
  {
    id: "openai-usage",
    email: email({
      from: "OpenAI <noreply@tm.openai.com>",
      subject: "Your OpenAI API invoice for September 2026",
      date: "2026-10-02T00:30:00Z",
      text: `Your invoice is ready.\n\nOrganization: Banana Intelligence\nUsage period: Sep 1 to Sep 30, 2026\nAPI usage: $37.42\nTotal due: $37.42\nPaid with Mastercard ending 4242 on Oct 2, 2026.\nInvoice number: OAI-2026-09-55120`,
    }),
    expect: { type: "receipt", vendor: "OpenAI", amountCents: 3742, currency: "USD", billedAt: "2026-10-02", cadence: "usage", invoiceId: "OAI-2026-09-55120" },
  },
  {
    id: "anthropic-credits",
    email: email({
      from: "Anthropic <receipts@mail.anthropic.com>",
      subject: "Receipt for your Anthropic API credit purchase",
      date: "2026-09-28T17:45:00Z",
      text: `Thanks for your purchase.\n\nAnthropic API credits: $100.00\nTotal paid: $100.00 USD\nDate: September 28, 2026\nPaid with Visa ending 4242\nReceipt #rcpt_2Kx91`,
    }),
    expect: { type: "receipt", vendor: "Anthropic", amountCents: 10000, currency: "USD", billedAt: "2026-09-28", cadence: "one_time", invoiceId: "rcpt_2Kx91" },
  },
  {
    id: "railway-usage",
    email: email({
      from: "Railway <team@railway.app>",
      subject: "Your Railway invoice for October 2026",
      date: "2026-11-01T06:00:00Z",
      text: `Invoice for October 2026\n\nProject: ledger-api\nHobby plan: $5.00\nUsage above plan: $3.17\nTotal: $8.17 USD\nCharged November 1, 2026 to card ending 4242.\nInvoice 7f3a-oct-2026`,
    }),
    expect: { type: "receipt", vendor: "Railway", amountCents: 817, currency: "USD", billedAt: "2026-11-01", plan: "Hobby", projectNames: ["ledger-api"], invoiceId: "7f3a-oct-2026" },
  },
  {
    id: "render-payment-failed",
    email: email({
      from: "Render <billing@render.com>",
      subject: "Action required: payment failed for your Render workspace",
      date: "2026-10-26T11:20:00Z",
      text: `We could not process your payment of $7.00 for the workspace "plain-ballot".\n\nYour card ending 4242 was declined. Please update your payment method within 7 days to avoid service suspension.\n\nUpdate payment method: https://dashboard.render.com/billing`,
    }),
    expect: { type: "payment_failed", vendor: "Render", amountCents: 700, currency: "USD", projectNames: ["plain-ballot"] },
  },
  {
    id: "stripe-processed-saas",
    email: email({
      from: "Loom <receipts+acct_1Loom@stripe.com>",
      subject: "Your receipt from Loom #1182-4471",
      date: "2026-10-09T15:05:00Z",
      text: `Receipt from Loom\n\nAmount paid $15.00\nDate paid October 9, 2026\nPayment method •••• 4242\n\nLoom Business, monthly\nOct 9 to Nov 9, 2026\n\nReceipt #1182-4471\nThis receipt was sent by Stripe on behalf of Loom.`,
    }),
    expect: { type: "receipt", vendor: "Loom", amountCents: 1500, currency: "USD", billedAt: "2026-10-09", plan: "Business", cadence: "monthly", invoiceId: "1182-4471" },
  },
  {
    id: "paddle-eur",
    email: email({
      from: "Paddle.com <help@paddle.com>",
      subject: "Your invoice from Paddle.com for Raycast Pro",
      date: "2026-10-11T10:00:00Z",
      text: `Paddle.com Market Ltd, reseller for Raycast\n\nRaycast Pro, annual subscription\nNet: €96.00\nVAT (21%): €20.16\nTotal: €116.16\nPaid 11 Oct 2026, card ending 4242\nInvoice number: PDL-55719-2026`,
    }),
    expect: { type: "receipt", vendor: "Raycast", amountCents: 9600, currency: "EUR", billedAt: "2026-10-11", plan: "Pro", cadence: "annual", invoiceId: "PDL-55719-2026" },
  },
  {
    id: "gbp-receipt",
    email: email({
      from: "Fathom <billing@usefathom.com>",
      subject: "Your Fathom Analytics receipt",
      date: "2026-10-03T07:00:00Z",
      text: `Thanks for being a Fathom customer.\n\nPlan: Fathom 100k (monthly)\nAmount: £11.00\nDate: 3 October 2026\nSite: natepeace.com\nReceipt: FA-20261003-88`,
    }),
    expect: { type: "receipt", vendor: "Fathom", amountCents: 1100, currency: "GBP", billedAt: "2026-10-03", cadence: "monthly", projectNames: ["natepeace.com"], invoiceId: "FA-20261003-88" },
  },
  {
    id: "trial-ending",
    email: email({
      from: "Linear <hello@linear.app>",
      subject: "Your Linear trial ends in 3 days",
      date: "2026-10-28T16:00:00Z",
      text: `Your 14-day trial of Linear Business for workspace "banana" ends on October 31, 2026. After that you will be billed $14.00 per user per month for 4 users ($56.00/month).\n\nTo stay on the free plan instead, downgrade in Settings → Plans.`,
    }),
    expect: { type: "trial_notice", vendor: "Linear", amountCents: 5600, currency: "USD", dueAt: "2026-10-31", plan: "Business", projectNames: ["banana"] },
  },
  {
    id: "plan-change",
    email: email({
      from: "Netlify <team@netlify.com>",
      subject: "Your Netlify plan has been changed",
      date: "2026-09-20T12:00:00Z",
      text: `Hi there,\n\nTeam "peace-process" moved from Starter to Pro. Your new rate is $19.00 per member per month, prorated from today. Your next invoice on October 20, 2026 will reflect this.\n\nNetlify`,
    }),
    // A new rate is not a charge: nothing was billed in this email, so amount is null.
    expect: { type: "plan_change", vendor: "Netlify", amountCents: null, currency: null, plan: "Pro", projectNames: ["peace-process"] },
  },
  {
    id: "app-store-payout-not-billing",
    email: email({
      from: "App Store Connect <no_reply@email.apple.com>",
      subject: "Your payment of $412.30 has been sent",
      date: "2026-10-07T18:00:00Z",
      text: `Hello,\n\nYour proceeds for September 2026 have been paid.\n\nAmount: $412.30 USD\nBank account ending 0000\nExpected to arrive within 2 to 3 business days.\n\nView Payments and Financial Reports in App Store Connect.`,
    }),
    expect: { type: "other", vendor: "Apple App Store Connect", amountCents: null, currency: null },
  },
  {
    id: "deploy-not-billing",
    email: email({
      from: "Vercel <notifications@vercel.com>",
      subject: "Deployment failed: spooky-particles (production)",
      date: "2026-10-30T22:10:00Z",
      text: `Your deployment of spooky-particles to production failed.\n\nError: Build exceeded maximum duration.\n\nView logs: https://vercel.com/banana/spooky-particles/deployments/abc`,
    }),
    expect: { type: "deployment", vendor: "Vercel", amountCents: null, currency: null },
  },
  {
    id: "newsletter-other",
    email: email({
      from: "Cloudflare <email@email.cloudflare.com>",
      subject: "What's new this month: Workers AI, faster builds",
      date: "2026-10-18T13:00:00Z",
      text: `Hello builder,\n\nThis month we shipped Workers AI improvements, a 2x faster Pages build, and new pricing calculators. Read the roundup → \n\nYou are receiving this because you opted in to product news. Unsubscribe.`,
      auth: verified,
    }),
    expect: { type: "other", vendor: "Cloudflare", amountCents: null, currency: null },
  },
  {
    id: "phishing-domain-renewal-unverified",
    email: email({
      from: "Domain Services <renewals@domain-notice-center.example>",
      subject: "FINAL NOTICE: spookyparticles.com expiration",
      date: "2026-10-22T04:00:00Z",
      text: `Your domain spookyparticles.com will be TERMINATED unless you pay the renewal fee of $89.00 within 48 hours. Pay now at http://domain-notice-center.example/pay`,
      auth: unverified,
    }),
    // A domain notice from a sender that names no real company: vendor unknown, no stated
    // date ("within 48 hours" is not a date, and the prompt forbids inferring one). The gate
    // that matters is that it never becomes a finding, which the pipeline enforces through
    // senderVerified, not through the model.
    // dueAt is not checked: "within 48 hours" is sometimes turned into a date and sometimes not.
    expect: { type: "domain_or_dns", vendor: "unknown", amountCents: 8900, currency: "USD", domainNames: ["spookyparticles.com"] },
  },
];
