/**
 * Tier 3: validation and confidence, in code. Every model
 * record passes here before it becomes a receipt row. Pure and unit tested.
 */
import type { Tier2 } from "./schemas";

export const ISO_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "JPY", "INR", "BRL", "MXN", "SGD", "HKD", "PLN", "CZK", "ILS", "ZAR", "KRW", "TRY", "AED",
]);

/** Currencies with no minor unit: amounts are whole. */
const ZERO_DECIMAL = new Set(["JPY", "KRW"]);

/** "1,234.56" or "1.234,56" or "20" to minor units; null when it is not a number. */
export function parseAmountCents(raw: string | null | undefined, currency: string | null): number | null {
  if (raw === null || raw === undefined) return null;
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  // Decide which separator is decimal: the last one, when it is followed by 1 or 2 digits.
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let whole = s;
  let frac = "";
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    whole = s.slice(0, lastSep);
    frac = s.slice(lastSep + 1);
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) return null;
  const units = Number(whole || "0");
  if (!Number.isFinite(units)) return null;
  const zeroDecimal = currency ? ZERO_DECIMAL.has(currency) : false;
  const cents = zeroDecimal ? units * 100 : units * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function parseIsoDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Cadence from the service period when the model left it unknown: 25 to 36
 * days is monthly, 350 to 380 is annual. Deterministic, costs nothing.
 */
export function inferCadence(stated: Tier2["cadence"], periodStart: Date | null, periodEnd: Date | null): Tier2["cadence"] {
  if (stated !== "unknown") return stated;
  if (!periodStart || !periodEnd) return stated;
  const days = (periodEnd.getTime() - periodStart.getTime()) / DAY;
  if (days >= 25 && days <= 36) return "monthly";
  if (days >= 350 && days <= 380) return "annual";
  return stated;
}

export type ValidatedReceipt = {
  cadence: Tier2["cadence"];
  amountCents: number | null;
  currency: string | null;
  billedAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  dueAt: Date | null;
  confidence: number;
  checks: { passed: string[]; failed: { check: string; reason: string }[] };
};

export type ValidateContext = {
  /** The email's own date, the anchor for plausibility. */
  emailDate: Date | null;
  tier1Confidence: number | null;
  senderVerified: boolean;
  nowMs?: number;
};

const DAY = 86_400_000;

/**
 * Checks, each named so the UI and the eval can show which failed:
 * - currency_iso, amount_parses, amount_sane (0 to 1,000,000 units)
 * - arithmetic: when tax and total are shown, amount + tax equals total (1 cent slack)
 * - billed_near_email: the charge date is within 45 days of the email date
 * - period_order: period_end is not before period_start
 * - due_plausible: a due date is between 2 years back and 3 years ahead of the email
 * Confidence = model confidence, averaged with the Tier 1 score when present,
 * times a penalty per failed check; unverified senders cap at 0.6.
 */
export function validateReceipt(rec: Tier2, ctx: ValidateContext): ValidatedReceipt {
  const passed: string[] = [];
  const failed: { check: string; reason: string }[] = [];
  const pass = (c: string) => passed.push(c);
  const fail = (c: string, reason: string) => failed.push({ check: c, reason });

  const currency = rec.currency ? rec.currency.trim().toUpperCase() : null;
  if (rec.amount !== null) {
    if (currency && ISO_CURRENCIES.has(currency)) pass("currency_iso");
    else fail("currency_iso", currency ? `unknown currency ${currency}` : "amount without currency");
  }
  let amountCents = parseAmountCents(rec.amount, currency);
  if (rec.amount !== null) {
    if (amountCents === null) fail("amount_parses", `could not read "${rec.amount}"`);
    else pass("amount_parses");
  }
  if (amountCents !== null) {
    if (amountCents >= 0 && amountCents <= 100_000_000) pass("amount_sane");
    else {
      fail("amount_sane", `${amountCents} cents is outside 0 to 1,000,000`);
      amountCents = null;
    }
  }

  const tax = parseAmountCents(rec.tax, currency);
  const total = parseAmountCents(rec.total, currency);
  if (amountCents !== null && tax !== null && total !== null) {
    if (Math.abs(amountCents + tax - total) <= 1) pass("arithmetic");
    else fail("arithmetic", `amount ${amountCents} + tax ${tax} is not total ${total}`);
  }

  const billedAt = parseIsoDate(rec.billed_at);
  if (billedAt && ctx.emailDate) {
    if (Math.abs(billedAt.getTime() - ctx.emailDate.getTime()) <= 45 * DAY) pass("billed_near_email");
    else fail("billed_near_email", `charge date ${rec.billed_at} is far from the email date`);
  }

  const periodStart = parseIsoDate(rec.period_start);
  const periodEnd = parseIsoDate(rec.period_end);
  if (periodStart && periodEnd) {
    if (periodEnd.getTime() >= periodStart.getTime()) pass("period_order");
    else fail("period_order", "period ends before it starts");
  }

  const dueAt = parseIsoDate(rec.due_at);
  if (dueAt) {
    const anchor = ctx.emailDate?.getTime() ?? ctx.nowMs ?? Date.now();
    if (dueAt.getTime() >= anchor - 730 * DAY && dueAt.getTime() <= anchor + 1095 * DAY) pass("due_plausible");
    else fail("due_plausible", `due date ${rec.due_at} is implausible`);
  }

  let confidence = clamp01(rec.confidence);
  if (ctx.tier1Confidence !== null) confidence = (confidence + clamp01(ctx.tier1Confidence)) / 2;
  confidence *= Math.pow(0.7, failed.length);
  if (!ctx.senderVerified) confidence = Math.min(confidence, 0.6);

  return {
    cadence: inferCadence(rec.cadence, periodStart, periodEnd),
    amountCents,
    currency: amountCents !== null ? currency : null,
    billedAt,
    periodStart,
    periodEnd,
    dueAt,
    confidence: Math.round(confidence * 1000) / 1000,
    checks: { passed, failed },
  };
}

/**
 * "Loom Business" with vendor "Loom" is the "Business" plan: vendors often write
 * the product name into the plan line. Strips a leading vendor name, keeps the rest.
 */
export function normalizePlan(plan: string | null | undefined, vendor: string | null | undefined): string | null {
  if (!plan) return null;
  let p = plan.trim().replace(/\s+/g, " ");
  // "Pro ($19.00 per member per month)": the price is not part of the name.
  p = p.replace(/\s*\((?=[^)]*(?:[$€£¥]|\b(?:USD|EUR|GBP)\b|\d+(?:\.\d{2})?\s*(?:per|\/)))[^)]*\)/g, "").trim();
  const v = vendor?.trim();
  if (v && p.toLowerCase().startsWith(v.toLowerCase() + " ") && p.length > v.length + 1) p = p.slice(v.length + 1).trim();
  p = p.replace(/^(plan|tier)\s*:?\s*/i, "").replace(/\s*(plan|tier)$/i, "").trim();
  return p || null;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * Two receipts are the same charge when the invoice id matches, or when vendor,
 * amount and day match with no id. Used across inboxes (the same bill cc'd to two addresses).
 */
export function dedupeKey(r: { vendor: string; invoiceId: string | null; amountCents: number | null; billedAt: Date | null }): string | null {
  const vendor = r.vendor.trim().toLowerCase();
  if (r.invoiceId) return `${vendor}#id:${r.invoiceId.trim().toLowerCase()}`;
  if (r.amountCents !== null && r.billedAt) return `${vendor}#amt:${r.amountCents}@${r.billedAt.toISOString().slice(0, 10)}`;
  return null;
}
