import { describe, expect, it } from "vitest";
import type { Receipt } from "@/db/schema";
import { buildSpend, cadenceFromDates, clusterByAmount, dedupeReceipts, monthlyAmount, vendorKey } from "./spend";

const now = Date.UTC(2026, 10, 2);
const d = (iso: string) => new Date(iso);

let n = 0;
function receipt(over: Partial<Receipt> & { billedAt: Date; amountCents: number; inbox?: string }): Receipt & { inbox: string } {
  n += 1;
  return {
    id: `r${n}`,
    userId: "u",
    connectionId: "c1",
    messageId: `m${n}`,
    kind: "receipt",
    vendor: "Vercel",
    currency: "USD",
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
    cadence: "unknown",
    senderVerified: true,
    templateFingerprint: null,
    confidence: 0.9,
    checks: { passed: [], failed: [] },
    model: "test",
    inputTokens: 0,
    outputTokens: 0,
    extractedAt: new Date(now),
    inbox: "you@example.com",
    ...over,
  } as Receipt & { inbox: string };
}

describe("cadenceFromDates", () => {
  it("reads monthly and annual gaps, trusts a stated cadence", () => {
    expect(cadenceFromDates([d("2026-08-01"), d("2026-09-01"), d("2026-10-01")], null)).toBe("monthly");
    expect(cadenceFromDates([d("2025-10-01"), d("2026-10-01")], null)).toBe("annual");
    expect(cadenceFromDates([d("2026-10-01")], null)).toBe("unknown");
    expect(cadenceFromDates([d("2026-10-01")], "annual")).toBe("annual");
    expect(cadenceFromDates([d("2026-08-03"), d("2026-09-02"), d("2026-10-01")], "usage")).toBe("usage");
  });
});

describe("monthlyAmount", () => {
  it("spreads annual, takes the latest monthly, averages usage over three months", () => {
    expect(monthlyAmount([{ amountCents: 24000, billedAt: d("2026-10-01") }], "annual", now)).toBe(2000);
    expect(monthlyAmount([{ amountCents: 2000, billedAt: d("2026-09-01") }, { amountCents: 2500, billedAt: d("2026-10-01") }], "monthly", now)).toBe(2500);
    expect(
      monthlyAmount(
        [
          { amountCents: 1200, billedAt: d("2026-08-02") },
          { amountCents: 1800, billedAt: d("2026-09-02") },
          { amountCents: 3000, billedAt: d("2026-10-02") },
        ],
        "usage",
        now,
      ),
    ).toBe(2000);
    expect(monthlyAmount([], "monthly", now)).toBeNull();
  });
});

describe("vendorKey", () => {
  it("merges spellings and routes Google storage plans to Google One", () => {
    expect(vendorKey("Eleven Labs")).toBe("elevenlabs");
    expect(vendorKey("ElevenLabs")).toBe("elevenlabs");
    expect(vendorKey("TheSportsDB")).toBe("thedatadb");
    expect(vendorKey("Apple Services")).toBe("apple");
    expect(vendorKey("Super Publishing")).toBe("super");
    expect(vendorKey("Google", "AI Pro (5 TB)")).toBe("googleone");
    expect(vendorKey("Google", "Workspace Business")).toBe("google");
    expect(vendorKey("Vercel Inc.")).toBe("vercelinc");
  });
});

describe("dedupeReceipts and clusterByAmount", () => {
  it("counts the same invoice once across inboxes and remembers both inboxes", () => {
    const a = receipt({ amountCents: 2500, billedAt: d("2026-10-05"), invoiceId: "INV-1" });
    const b = receipt({ amountCents: 2500, billedAt: d("2026-10-05"), invoiceId: "inv-1", connectionId: "c2", inbox: "ops@example.com" });
    const { rows, inboxesOf } = dedupeReceipts([a, b]);
    expect(rows).toHaveLength(1);
    expect(inboxesOf.get(a.id)).toEqual(["you@example.com", "ops@example.com"]);
  });
  it("splits lines only when amounts differ by more than two percent", () => {
    const lines = clusterByAmount([{ amountCents: 1999 }, { amountCents: 1999 }, { amountCents: 2010 }, { amountCents: 9900 }]);
    expect(lines.map((l) => l.length)).toEqual([3, 1]);
  });
});

describe("buildSpend", () => {
  it("sums verified active work subscriptions in the home currency only", () => {
    const rows = [
      receipt({ amountCents: 2000, billedAt: d("2026-08-01") }),
      receipt({ amountCents: 2000, billedAt: d("2026-09-01") }),
      receipt({ amountCents: 2000, billedAt: d("2026-10-01") }),
      receipt({ vendor: "Supabase", plan: null, amountCents: 2500, billedAt: d("2026-10-05"), cadence: "monthly" }),
      receipt({ vendor: "Hetzner", plan: null, amountCents: 1500, currency: "EUR", billedAt: d("2026-10-05"), cadence: "monthly" }),
      receipt({ vendor: "Old Tool", plan: null, amountCents: 900, billedAt: d("2026-01-05"), cadence: "monthly" }),
      receipt({ vendor: "Phish Co", plan: null, amountCents: 9900, billedAt: d("2026-10-05"), senderVerified: false }),
      receipt({ vendor: "Vercel", amountCents: 0, billedAt: d("2026-10-01") }),
    ];
    const r = buildSpend(rows, { nowMs: now, scopes: new Map([["hetzner", "work"], ["oldtool", "work"]]) });
    expect(r.monthlyCents).toBe(4500);
    expect(r.otherCurrencies).toEqual([{ currency: "EUR", monthlyCents: 1500, count: 1 }]);
    expect(r.unverified).toBe(1);
    const vercel = r.subscriptions.find((s) => s.vendor === "Vercel");
    expect(vercel).toMatchObject({ cadence: "monthly", monthlyCents: 2000, receipts: 3, plan: "Pro", scope: "work", active: true, id: "vercel|0|c1" });
    expect(vercel?.nextExpectedAt).toBe("2026-10-31T00:00:00.000Z");
    const old = r.subscriptions.find((s) => s.vendor === "Old Tool");
    expect(old?.monthlyCents).toBeNull();
    expect(old?.active).toBe(false);
    expect(old?.nextExpectedAt).toBeNull();
    expect(r.activeCount).toBe(3);
    expect(r.lapsedCount).toBe(1);
  });

  it("keeps personal and unknown vendors out of the headline but lists them", () => {
    const rows = [
      receipt({ vendor: "Vercel", amountCents: 2000, billedAt: d("2026-10-01"), cadence: "monthly" }),
      receipt({ vendor: "Spotify", plan: "Premium", amountCents: 2199, billedAt: d("2026-10-13"), cadence: "monthly" }),
      receipt({ vendor: "Mystery Co", plan: null, amountCents: 1000, billedAt: d("2026-10-13"), cadence: "monthly" }),
    ];
    const r = buildSpend(rows, { nowMs: now, scopes: new Map([["spotify", "personal"]]) });
    expect(r.monthlyCents).toBe(2000);
    expect(r.personalMonthlyCents).toBe(2199);
    expect(r.unknownMonthlyCents).toBe(1000);
    expect(r.subscriptions.find((s) => s.vendor === "Spotify")?.scope).toBe("personal");
    expect(r.subscriptions.find((s) => s.vendor === "Mystery Co")?.scope).toBe("unknown");
    expect(r.byCategory).toEqual([{ category: "hosting", monthlyCents: 2000, count: 1 }]);
  });

  it("merges vendor spellings and same-price plan variants into one line", () => {
    const rows = [
      receipt({ vendor: "Eleven Labs", plan: "Pro", amountCents: 9900, billedAt: d("2026-08-30"), cadence: "monthly" }),
      receipt({ vendor: "Eleven Labs", plan: "Pro", amountCents: 9900, billedAt: d("2026-09-30"), cadence: "monthly" }),
      receipt({ vendor: "ElevenLabs", plan: "Pro", amountCents: 9900, billedAt: d("2026-10-30"), cadence: "monthly" }),
      receipt({ vendor: "Apple", plan: "AppleCare One", amountCents: 1999, billedAt: d("2026-09-09"), cadence: "monthly" }),
      receipt({ vendor: "Apple", plan: "AppleCare One Individual (Monthly)", amountCents: 1999, billedAt: d("2026-10-09"), cadence: "monthly" }),
      receipt({ vendor: "Apple", plan: "Developer Program", amountCents: 9900, billedAt: d("2026-07-23"), cadence: "annual" }),
    ];
    const r = buildSpend(rows, { nowMs: now, scopes: new Map([["elevenlabs", "work"], ["apple", "work"]]) });
    const eleven = r.subscriptions.filter((s) => s.vendorKey === "elevenlabs");
    expect(eleven).toHaveLength(1);
    expect(eleven[0]).toMatchObject({ vendor: "ElevenLabs", monthlyCents: 9900, receipts: 3 });
    const apple = r.subscriptions.filter((s) => s.vendorKey === "apple");
    expect(apple).toHaveLength(2);
    expect(apple.find((s) => s.monthlyCents === 1999)?.receipts).toBe(2);
    expect(apple.find((s) => s.cadence === "annual")?.monthlyCents).toBe(825);
    expect(r.monthlyCents).toBe(9900 + 1999 + 825);
  });

  it("treats a lone receipt with no stated cadence as one-off, not recurring", () => {
    const rows = [receipt({ vendor: "Castlery", plan: null, amountCents: 45000, billedAt: d("2026-10-20"), cadence: "unknown" })];
    const r = buildSpend(rows, { nowMs: now });
    expect(r.subscriptions[0]).toMatchObject({ cadence: "one_time", monthlyCents: null, active: false });
    expect(r.monthlyCents).toBe(0);
  });

  it("keeps the same vendor in two inboxes as two lines when the bills differ", () => {
    const rows = [
      receipt({ amountCents: 2000, billedAt: d("2026-10-01"), cadence: "monthly", invoiceId: "a" }),
      receipt({ amountCents: 2000, billedAt: d("2026-10-02"), cadence: "monthly", invoiceId: "b", connectionId: "c2", inbox: "ops@example.com" }),
    ];
    const r = buildSpend(rows, { nowMs: now });
    expect(r.subscriptions).toHaveLength(2);
    expect(r.monthlyCents).toBe(4000);
  });
});
