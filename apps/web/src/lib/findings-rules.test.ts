import { describe, expect, it } from "vitest";
import type { Receipt } from "@/db/schema";
import { computeFindings, linkSubscriptions, matchRepo } from "./findings-rules";
import type { Subscription } from "./spend";

const now = Date.UTC(2026, 10, 2);
const d = (iso: string) => new Date(iso);

let n = 0;
function receipt(over: Partial<Receipt> & { inbox?: string; subject?: string | null }): Receipt & { inbox: string; subject: string | null } {
  n += 1;
  return {
    id: `r${n}`,
    userId: "u",
    connectionId: "c1",
    messageId: `m${n}`,
    kind: "receipt",
    vendor: "Vercel",
    amountCents: 2000,
    currency: "USD",
    billedAt: d("2026-10-01"),
    periodStart: null,
    periodEnd: null,
    dueAt: null,
    plan: "Pro",
    projectNames: [],
    domainNames: [],
    accountEmail: null,
    cardLast4: null,
    invoiceId: null,
    status: "paid",
    cadence: "monthly",
    senderVerified: true,
    templateFingerprint: null,
    confidence: 0.9,
    checks: { passed: [], failed: [] },
    model: "test",
    inputTokens: 0,
    outputTokens: 0,
    extractedAt: new Date(now),
    inbox: "you@example.com",
    subject: "Your receipt",
    ...over,
  } as Receipt & { inbox: string; subject: string | null };
}

function sub(over: Partial<Subscription>): Subscription {
  return {
    id: "vercel|0|c1",
    accountEmails: [],
    vendorKey: "vercel",
    vendor: "Vercel",
    category: "hosting",
    scope: "work",
    plan: "Pro",
    inbox: "you@example.com",
    inboxes: ["you@example.com"],
    connectionId: "c1",
    cadence: "monthly",
    monthlyCents: 2000,
    active: true,
    currency: "USD",
    lastBilledAt: "2026-10-01T00:00:00.000Z",
    nextExpectedAt: "2026-10-31T00:00:00.000Z",
    receipts: 3,
    verified: true,
    receiptIds: ["r1"],
    projectNames: [],
    ...over,
  };
}

describe("computeFindings", () => {
  it("flags one vendor billed to two inboxes, valued at the smaller plan", () => {
    const f = computeFindings({
      subscriptions: [sub({}), sub({ id: "vercel|hobby|c2", plan: "Hobby", connectionId: "c2", inbox: "ops@example.com", monthlyCents: 1000 })],
      receipts: [],
      repos: [],
      nowMs: now,
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "duplicate_plan", key: "duplicate_plan:vercel", amountCents: 1000 });
    expect(f[0].evidence.inbox).toContain("ops@example.com");
  });

  it("flags a paid project whose repo is idle, and not an active one", () => {
    const repos = [
      { id: "n1", name: "n8peace/old-site", status: "active", lastActivityAt: d("2026-05-01") },
      { id: "n2", name: "n8peace/spooky-particles", status: "active", lastActivityAt: d("2026-11-01") },
    ];
    const f = computeFindings({
      subscriptions: [sub({ projectNames: ["old-site"] }), sub({ id: "vercel|pro|c1|2", projectNames: ["spooky-particles"] })],
      receipts: [],
      repos,
      nowMs: now,
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "zombie", amountCents: 2000, nodeIds: ["n1"] });
    expect(f[0].evidence.repo).toBe("n8peace/old-site");
    expect(f[0].title).toMatch(/no push in 18\d days/);
  });

  it("flags renewals due within 30 days and skips far ones", () => {
    const f = computeFindings({
      subscriptions: [],
      receipts: [
        receipt({ kind: "domain_or_dns", vendor: "Namecheap", amountCents: 1288, domainNames: ["spookyparticles.ai"], dueAt: d("2026-11-20"), subject: "spookyparticles.ai renews soon" }),
        receipt({ kind: "renewal_notice", vendor: "Figma", amountCents: 14400, dueAt: d("2027-03-01") }),
        receipt({ kind: "renewal_notice", vendor: "Phish", amountCents: 9900, dueAt: d("2026-11-10"), senderVerified: false }),
      ],
      repos: [],
      nowMs: now,
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "expiring", amountCents: 1288 });
    expect(f[0].title).toBe("spookyparticles.ai renews in 18 days for $12.88");
  });

  it("flags a recent failed payment unless a later receipt shows it was fixed", () => {
    const failed = receipt({ kind: "payment_failed", vendor: "Supabase", amountCents: null, billedAt: d("2026-10-25"), cardLast4: "4242", subject: "Payment failed" });
    const f1 = computeFindings({ subscriptions: [sub({ vendor: "Supabase", monthlyCents: 2500 })], receipts: [failed], repos: [], nowMs: now });
    expect(f1).toHaveLength(1);
    expect(f1[0]).toMatchObject({ kind: "expired_card", amountCents: 2500 });
    expect(f1[0].title).toBe("Supabase could not charge your card ending 4242");

    const f2 = computeFindings({
      subscriptions: [],
      receipts: [failed, receipt({ vendor: "Supabase", amountCents: 2500, billedAt: d("2026-10-28") })],
      repos: [],
      nowMs: now,
    });
    expect(f2).toHaveLength(0);
  });

  it("matches project names to repos loosely but not too loosely", () => {
    const repos = [{ id: "n1", name: "n8peace/My_Site", status: "active", lastActivityAt: null }];
    expect(matchRepo("my-site", repos)?.id).toBe("n1");
    expect(matchRepo("n8peace/my-site", repos)?.id).toBe("n1");
    expect(matchRepo("site", repos)).toBeNull();
    expect(matchRepo("ab", repos)).toBeNull();
  });
});

describe("linkSubscriptions", () => {
  const repos = [
    { id: "n1", name: "hubot/notify-cli", status: "active", lastActivityAt: null },
    { id: "n2", name: "octocat/ledger-api", status: "active", lastActivityAt: null },
    { id: "n3", name: "octocat/natepeace.com", status: "active", lastActivityAt: null },
  ];

  it("links a line to every repo its receipts name, by project or by domain", () => {
    const r1 = receipt({ projectNames: ["notify-cli"], domainNames: [] });
    const r2 = receipt({ projectNames: ["ledger-api", "Notify CLI"], domainNames: ["natepeace.com"] });
    const links = linkSubscriptions([sub({ id: "a", receiptIds: [r1.id, r2.id], projectNames: ["notify-cli"] })], [r1, r2], repos);
    expect(links.get("a")).toEqual(["hubot/notify-cli", "octocat/ledger-api", "octocat/natepeace.com"]);
  });

  it("leaves a line no repo claims out of the map", () => {
    const r = receipt({ projectNames: ["something-else"], domainNames: ["example.org"] });
    const links = linkSubscriptions([sub({ id: "b", receiptIds: [r.id] })], [r], repos);
    expect(links.has("b")).toBe(false);
  });

  it("reads the line's own project names when its receipts are not loaded", () => {
    const links = linkSubscriptions([sub({ id: "c", receiptIds: ["missing"], projectNames: ["ledger-api"] })], [], repos);
    expect(links.get("c")).toEqual(["octocat/ledger-api"]);
  });
});
