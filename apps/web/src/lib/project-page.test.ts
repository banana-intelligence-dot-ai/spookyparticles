import { describe, expect, it } from "vitest";
import { buildProjectPage, customDomainOf, receiptTouches, type PageDeployment, type PageFinding, type PageLine, type PageReceipt, type ProjectPageInput } from "./project-page";

const NOW = Date.parse("2026-11-02T18:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const ahead = (d: number) => new Date(NOW + d * DAY).toISOString();
const NAME = "octocat/billing-web";

const line = (over: Partial<PageLine> & Pick<PageLine, "id" | "vendor">): PageLine => ({
  vendorKey: over.vendor.toLowerCase().replace(/[^a-z0-9]/g, ""),
  category: "hosting",
  scope: "work",
  active: true,
  verified: true,
  monthlyCents: 2000,
  currency: "USD",
  inbox: "you@example.com",
  inboxes: ["you@example.com"],
  accountEmails: [],
  plan: "Pro",
  cadence: "monthly",
  lastBilledAt: ago(5),
  receipts: 3,
  receiptIds: [`r-${over.id}`],
  projects: [NAME],
  ...over,
});

const dep = (over: Partial<PageDeployment>): PageDeployment => ({
  environment: "Production",
  state: "success",
  url: "https://billing-web.vercel.app",
  at: ago(2),
  provider: "Vercel",
  creator: "vercel[bot]",
  ...over,
});

const notice = (over: Partial<PageReceipt> & Pick<PageReceipt, "id">): PageReceipt => ({
  kind: "renewal_notice",
  vendor: "Namecheap",
  amountCents: 7000,
  currency: "USD",
  at: ago(3),
  dueAt: ahead(40),
  projectNames: [],
  domainNames: [],
  inbox: "you@example.com",
  subject: "Your domain renews soon",
  verified: true,
  ...over,
});

function input(over: Partial<ProjectPageInput> = {}): ProjectPageInput {
  return {
    repo: { id: "r1", name: NAME, url: null, private: true, defaultBranch: "main", language: "TypeScript", status: "active", lastPushAt: ago(2), health: "ok" },
    deployments: [dep({})],
    lines: [],
    receipts: [],
    findings: [],
    repoNames: [NAME, "octocat/ledger-api", "hubot/docs-site"],
    currency: "USD",
    nowMs: NOW,
    ...over,
  };
}

describe("cost", () => {
  it("sums linked work lines once with Spend's rules, and names shared ones", () => {
    const page = buildProjectPage(
      input({
        lines: [
          line({ id: "vercel", vendor: "Vercel", projects: [NAME, "octocat/ledger-api", "hubot/docs-site"] }),
          line({ id: "supa", vendor: "Supabase", category: "database", monthlyCents: 2500, inbox: "billing@example.com" }),
          line({ id: "lapsed", vendor: "Render", active: false, monthlyCents: null }),
          line({ id: "phish", vendor: "Netlify", verified: false, monthlyCents: 1900 }),
          line({ id: "mystery", vendor: "Acme", scope: "unknown", category: "saas", monthlyCents: 500 }),
          line({ id: "other", vendor: "Fly.io", projects: ["octocat/ledger-api"] }),
        ],
      }),
    );
    expect(page.cogs.monthlyCents).toBe(4500);
    expect(page.cogs.bills).toBe(2);
    expect(page.cogs.sources).toEqual(["you@example.com", "billing@example.com"]);
    expect(page.cogs.shared).toEqual([{ vendor: "Vercel", plan: "Pro", monthlyCents: 2000, otherProjects: ["octocat/ledger-api", "hubot/docs-site"] }]);
    expect(page.cogs.unknownMonthlyCents).toBe(500);
    expect(page.cogs.notCounted).toBe(2);
    expect(page.cogs.spendPath).toBe("/app/findings?project=octocat%2Fbilling-web");
    // Another repo's bill never shows here.
    expect(page.services.flatMap((g) => g.services.map((s) => s.vendor))).not.toContain("Fly.io");
    expect(page.services.map((g) => g.label)).toEqual(["Hosting", "Database", "SaaS"]);
  });
});

describe("stack", () => {
  it("reads language from GitHub, hosts from deploys and bills, services from bills", () => {
    const page = buildProjectPage(
      input({
        deployments: [dep({}), dep({ environment: "ci", provider: "GitHub Actions", url: null })],
        lines: [line({ id: "netlify", vendor: "Netlify" }), line({ id: "openai", vendor: "OpenAI", category: "ai" })],
      }),
    );
    expect(page.stack.language).toBe("TypeScript");
    expect(page.stack.hosts).toEqual([
      { name: "Vercel", seenIn: ["deploys"] },
      { name: "Netlify", seenIn: ["bills"] },
    ]);
    expect(page.stack.services).toEqual([{ category: "ai", label: "AI", vendors: ["OpenAI"] }]);
    expect(page.stack.source).toBe("From repo metadata and bills");
  });
});

describe("domains", () => {
  it("takes custom deploy hosts and renewal dates from verified notices that touch the repo", () => {
    const page = buildProjectPage(
      input({
        deployments: [dep({ url: "https://www.billing.example.com" }), dep({ environment: "Preview", url: "https://billing-web-git.vercel.app" })],
        receipts: [
          notice({ id: "n1", domainNames: ["billing.example.com"], dueAt: ahead(18) }),
          notice({ id: "n2", domainNames: ["billing.example.com"], dueAt: ahead(500), verified: false }),
          notice({ id: "n3", domainNames: ["ledger.example.com"] }),
        ],
      }),
    );
    expect(page.domains.map((d) => d.name)).toEqual(["billing.example.com"]);
    expect(page.domains[0]).toMatchObject({ seenIn: ["deploy", "receipt"], live: true, registrar: "Namecheap", renewsAt: ahead(18), renewalCents: 7000 });
  });

  it("customDomainOf skips platform hosts and GitHub", () => {
    expect(customDomainOf("https://app.example.com/")).toBe("app.example.com");
    expect(customDomainOf("https://x.vercel.app")).toBeNull();
    expect(customDomainOf("https://github.com/o/r/actions/runs/1")).toBeNull();
    expect(customDomainOf(null)).toBeNull();
  });

  it("receiptTouches: a domain named after the repo counts only when no other repo shares the name", () => {
    const ctx = { linkedReceiptIds: new Set<string>(), deployDomains: new Set<string>(), repoNames: [NAME, "hubot/docs-site"] };
    expect(receiptTouches({ id: "a", projectNames: [], domainNames: ["billingweb.com"] }, NAME, ctx)).toBe("domain name");
    expect(receiptTouches({ id: "a", projectNames: ["billing-web"], domainNames: [] }, NAME, ctx)).toBe("name");
    expect(receiptTouches({ id: "a", projectNames: [], domainNames: ["billingweb.com"] }, NAME, { ...ctx, repoNames: [...ctx.repoNames, "hubot/billing-web"] })).toBeNull();
    expect(receiptTouches({ id: "a", projectNames: ["docs-site"], domainNames: [] }, NAME, ctx)).toBeNull();
  });
});

describe("project rules", () => {
  it("idle paid infra: host after 90 days, database after 120, never a shared line", () => {
    const deployments = [dep({ at: ago(100) })];
    const page = buildProjectPage(
      input({
        deployments,
        lines: [
          line({ id: "netlify", vendor: "Netlify", monthlyCents: 1900 }),
          line({ id: "supa", vendor: "Supabase", category: "database", monthlyCents: 2500 }),
          line({ id: "vercel", vendor: "Vercel", projects: [NAME, "hubot/docs-site"] }),
        ],
      }),
    );
    const idle = page.recommendations.filter((r) => r.kind === "idle_paid_infra");
    expect(idle.map((r) => r.vendor)).toEqual(["Netlify"]);
    expect(idle[0]).toMatchObject({ amountCents: 1900, per: "month", billingUrl: "https://app.netlify.com/teams/_/billing" });
    expect(idle[0].evidence.map((e) => e.label)).toEqual(["Bill", "Last deploy", "Last push"]);

    const later = buildProjectPage(input({ deployments: [dep({ at: ago(130) })], lines: [line({ id: "supa", vendor: "Supabase", category: "database", monthlyCents: 2500 })] }));
    expect(later.recommendations.map((r) => r.kind)).toEqual(["idle_paid_infra"]);
    // No deploy on record: absence of data is not evidence.
    expect(buildProjectPage(input({ deployments: [], lines: [line({ id: "n", vendor: "Netlify" })] })).recommendations).toEqual([]);
  });

  it("renewal without deploy: within 60 days and nothing live", () => {
    const receipts = [notice({ id: "n1", domainNames: ["billingweb.com"], dueAt: ahead(40) })];
    const quiet = buildProjectPage(input({ deployments: [dep({ state: "inactive", at: ago(200) })], receipts }));
    const rec = quiet.recommendations.find((r) => r.kind === "renewal_without_deploy");
    expect(rec).toMatchObject({ amountCents: 7000, per: "renewal", vendor: "Namecheap" });
    expect(rec?.evidence.map((e) => e.label)).toEqual(["Renewal", "Last deploy"]);
    // Live: nothing to say.
    expect(buildProjectPage(input({ receipts })).recommendations).toEqual([]);
  });

  it("renewal: an open expiring finding gains the deploy fact instead of a second line; a dismissed one silences it", () => {
    const receipts = [notice({ id: "n1", domainNames: ["billingweb.com"], dueAt: ahead(10) })];
    const finding: PageFinding = {
      id: "f1",
      kind: "expiring",
      title: "billingweb.com renews in 10 days for $70",
      action: "Decide before it renews.",
      amountCents: 7000,
      currency: "USD",
      status: "open",
      actionUrl: null,
      evidence: { inbox: "you@example.com", subjects: ["Your domain renews soon"], receiptIds: ["n1"] },
    };
    const deployments = [dep({ state: "failure" })];
    const open = buildProjectPage(input({ deployments, receipts, findings: [finding] }));
    expect(open.recommendations.map((r) => [r.source, r.kind])).toEqual([["finding", "expiring"]]);
    expect(open.recommendations[0].evidence.map((e) => e.label)).toEqual(["Email", "Last deploy"]);
    const dismissed = buildProjectPage(input({ deployments, receipts, findings: [{ ...finding, status: "dismissed" }] }));
    expect(dismissed.recommendations).toEqual([]);
  });

  it("two hosts: the one production does not use is the candidate", () => {
    const page = buildProjectPage(
      input({
        deployments: [dep({}), dep({ environment: "staging", provider: "Netlify", url: "https://bw.netlify.app", state: "inactive", at: ago(140) })],
        lines: [line({ id: "vercel", vendor: "Vercel" }), line({ id: "netlify", vendor: "Netlify", monthlyCents: 1900 })],
      }),
    );
    const rec = page.recommendations.find((r) => r.kind === "two_hosts");
    expect(rec?.title).toBe("Two hosts billed for billing-web: Vercel and Netlify");
    expect(rec).toMatchObject({ vendor: "Netlify", amountCents: 1900 });
    expect(rec?.evidence).toHaveLength(4);
    // The same facts, one side per host, for the side-by-side cards.
    expect(rec?.hosts?.map((h) => [h.vendor, h.production, h.candidate, h.monthlyCents])).toEqual([
      ["Vercel", true, false, rec?.hosts?.[0].monthlyCents],
      ["Netlify", false, true, 1900],
    ]);
    expect(rec?.hosts?.[1].deploy).toMatchObject({ label: "Last deploy", source: "GitHub deployments" });
    expect(rec?.hosts?.[1].deploy.value).not.toContain("via");

    // Production says nothing: both listed, no amount claimed.
    const unsure = buildProjectPage(input({ deployments: [], lines: [line({ id: "vercel", vendor: "Vercel" }), line({ id: "netlify", vendor: "Netlify" })] }));
    expect(unsure.recommendations.find((r) => r.kind === "two_hosts")).toMatchObject({ amountCents: null, vendor: null });
  });

  it("shows open findings that rest on this repo, sorted with renewals weighed per month", () => {
    const findings: PageFinding[] = [
      { id: "z", kind: "zombie", title: "Old", action: "", amountCents: 900, currency: "USD", status: "open", evidence: { inbox: null, subjects: [], receiptIds: [], repo: NAME, lastActivityAt: ago(120) } },
      { id: "x", kind: "duplicate_plan", title: "Other repo", action: "", amountCents: 5000, currency: "USD", status: "open", evidence: { inbox: null, subjects: [], receiptIds: ["elsewhere"] } },
      { id: "e", kind: "expiring", title: "Renews", action: "", amountCents: 7000, currency: "USD", status: "open", evidence: { inbox: null, subjects: [], receiptIds: ["r-vercel"] } },
    ];
    const page = buildProjectPage(input({ findings, lines: [line({ id: "vercel", vendor: "Vercel" })] }));
    expect(page.recommendations.map((r) => r.id)).toEqual(["z", "e"]);
  });
});
