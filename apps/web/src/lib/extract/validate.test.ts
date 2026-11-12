import { describe, expect, it } from "vitest";
import type { Tier2 } from "./schemas";
import { dedupeKey, inferCadence, normalizePlan, parseAmountCents, parseIsoDate, validateReceipt } from "./validate";

const base: Tier2 = {
  type: "receipt",
  vendor: "Vercel",
  amount: "20.00",
  currency: "USD",
  tax: null,
  total: null,
  billed_at: "2026-10-01",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  due_at: null,
  plan: "Pro",
  project_names: ["spooky-particles"],
  domain_names: [],
  account_email: null,
  card_last4: "4242",
  invoice_id: "in_123",
  status: "paid",
  cadence: "monthly",
  confidence: 0.95,
};
const email = new Date("2026-10-01T12:00:00Z");

describe("parseAmountCents", () => {
  it("reads US, European and bare formats", () => {
    expect(parseAmountCents("20.00", "USD")).toBe(2000);
    expect(parseAmountCents("$1,234.56", "USD")).toBe(123456);
    expect(parseAmountCents("1.234,56", "EUR")).toBe(123456);
    expect(parseAmountCents("20", "USD")).toBe(2000);
    expect(parseAmountCents("¥1,200", "JPY")).toBe(120000);
    expect(parseAmountCents("-5.50", "USD")).toBe(-550);
    expect(parseAmountCents("free", "USD")).toBeNull();
    expect(parseAmountCents(null, "USD")).toBeNull();
  });
});

describe("validateReceipt", () => {
  it("passes a clean receipt with full confidence", () => {
    const v = validateReceipt(base, { emailDate: email, tier1Confidence: 0.9, senderVerified: true });
    expect(v.amountCents).toBe(2000);
    expect(v.currency).toBe("USD");
    expect(v.checks.failed).toEqual([]);
    expect(v.checks.passed).toContain("billed_near_email");
    expect(v.confidence).toBeCloseTo(0.925, 3);
  });

  it("fails arithmetic and lowers confidence", () => {
    const v = validateReceipt({ ...base, tax: "2.00", total: "25.00" }, { emailDate: email, tier1Confidence: null, senderVerified: true });
    expect(v.checks.failed.map((f) => f.check)).toEqual(["arithmetic"]);
    expect(v.confidence).toBeCloseTo(0.95 * 0.7, 3);
  });

  it("drops an absurd amount and flags an unknown currency", () => {
    const v = validateReceipt({ ...base, amount: "99999999999", currency: "XXX" }, { emailDate: email, tier1Confidence: null, senderVerified: true });
    expect(v.amountCents).toBeNull();
    expect(v.checks.failed.map((f) => f.check)).toEqual(["currency_iso", "amount_sane"]);
  });

  it("caps confidence for unverified senders", () => {
    const v = validateReceipt(base, { emailDate: email, tier1Confidence: null, senderVerified: false });
    expect(v.confidence).toBe(0.6);
  });

  it("checks dates against the email", () => {
    const v = validateReceipt({ ...base, billed_at: "2024-01-01", period_end: "2026-09-01", due_at: "2040-01-01" }, { emailDate: email, tier1Confidence: null, senderVerified: true });
    expect(v.checks.failed.map((f) => f.check).sort()).toEqual(["billed_near_email", "due_plausible", "period_order"]);
    expect(parseIsoDate("2026-10-01T00:00:00Z")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(parseIsoDate("Oct 1")).toBeNull();
  });
});

describe("dedupeKey", () => {
  it("prefers the invoice id, then vendor + amount + day", () => {
    const day = new Date("2026-10-01T09:00:00Z");
    expect(dedupeKey({ vendor: "Vercel", invoiceId: "IN_123", amountCents: 2000, billedAt: day })).toBe("vercel#id:in_123");
    expect(dedupeKey({ vendor: "Vercel", invoiceId: null, amountCents: 2000, billedAt: day })).toBe("vercel#amt:2000@2026-10-01");
    expect(dedupeKey({ vendor: "Vercel", invoiceId: null, amountCents: null, billedAt: day })).toBeNull();
  });
});

describe("normalizePlan", () => {
  it("drops a leading vendor name and the word plan", () => {
    expect(normalizePlan("Loom Business", "Loom")).toBe("Business");
    expect(normalizePlan("Raycast Pro", "Raycast")).toBe("Pro");
    expect(normalizePlan("Pro plan", "Vercel")).toBe("Pro");
    expect(normalizePlan("Team (annual)", "GitHub")).toBe("Team (annual)");
    expect(normalizePlan("Pro ($19.00 per member per month)", "Netlify")).toBe("Pro");
    expect(normalizePlan("Business (monthly, $15/mo)", "Loom")).toBe("Business");
    expect(normalizePlan("Vercel", "Vercel")).toBe("Vercel");
    expect(normalizePlan(null, "Vercel")).toBeNull();
  });
});

describe("inferCadence", () => {
  it("reads monthly and annual periods, keeps a stated cadence", () => {
    const d = (s: string) => new Date(s);
    expect(inferCadence("unknown", d("2026-10-01"), d("2026-10-31"))).toBe("monthly");
    expect(inferCadence("unknown", d("2026-09-12"), d("2027-09-12"))).toBe("annual");
    expect(inferCadence("unknown", d("2026-10-01"), d("2026-10-03"))).toBe("unknown");
    expect(inferCadence("usage", d("2026-10-01"), d("2026-10-31"))).toBe("usage");
    expect(inferCadence("unknown", null, null)).toBe("unknown");
  });
});
