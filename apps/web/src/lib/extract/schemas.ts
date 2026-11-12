/**
 * What the models return, as strict schemas (Tiers 1 and 2).
 * The same schemas drive the eval harness, so a prompt change that breaks the
 * shape fails loudly instead of quietly producing nulls.
 */
import { z } from "zod";

export const RECEIPT_KINDS = [
  "receipt",
  "renewal_notice",
  "plan_change",
  "trial_notice",
  "payment_failed",
  "domain_or_dns",
  "deployment",
  "incident_alert",
  "deprecation_notice",
  "account_security",
  "other",
] as const;

export const Tier1Schema = z.object({
  type: z.enum(RECEIPT_KINDS),
  /** The company billing the user, normalized ("Vercel", not "Vercel Inc." or "vercel.com"). "unknown" when unsure. */
  vendor: z.string(),
  /** 0 to 1. */
  confidence: z.number(),
  /** The email states a money amount that was or will be charged. */
  has_amount: z.boolean(),
  /** An invoice or receipt is attached as a file. */
  has_attachment_invoice: z.boolean(),
});
export type Tier1 = z.infer<typeof Tier1Schema>;

export const Tier2Schema = z.object({
  type: z.enum(RECEIPT_KINDS),
  /** The real vendor. For Stripe, Paddle or Apple-processed receipts, the product being paid for, not the processor. */
  vendor: z.string(),
  /** Pre-tax amount charged or due, as a decimal string like "20.00". Null when the email states no amount. */
  amount: z.string().nullable(),
  /** ISO 4217 code, e.g. "USD", "EUR", "GBP". Null when no amount. */
  currency: z.string().nullable(),
  /** Tax shown separately, decimal string, or null. */
  tax: z.string().nullable(),
  /** Total including tax when shown, decimal string, or null. */
  total: z.string().nullable(),
  /** Date the charge happened, ISO date (YYYY-MM-DD), or null. */
  billed_at: z.string().nullable(),
  /** Service period covered, ISO dates, or null. */
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  /** For notices: when the thing renews, expires or is due. ISO date or null. */
  due_at: z.string().nullable(),
  /** Plan or tier name as the vendor writes it ("Pro", "Team", "Hobby"), or null. */
  plan: z.string().nullable(),
  /** Project, site, app, team or workspace names the email refers to. */
  project_names: z.array(z.string()),
  /** Domain names the email is about (renewals, DNS). */
  domain_names: z.array(z.string()),
  /** The account email the vendor addressed, when shown. */
  account_email: z.string().nullable(),
  /** Last four digits of the card, when shown. */
  card_last4: z.string().nullable(),
  /** Invoice, receipt or order id as printed. */
  invoice_id: z.string().nullable(),
  /** One word: paid, failed, refunded, trial, cancelled, due, or null. */
  status: z.string().nullable(),
  /** Billing cadence stated in the email: monthly, annual, usage, one_time, or unknown. */
  cadence: z.enum(["monthly", "annual", "usage", "one_time", "unknown"]),
  /** 0 to 1: how sure the extractor is of the amount and vendor. */
  confidence: z.number(),
});
export type Tier2 = z.infer<typeof Tier2Schema>;

export const SENDER_VERDICTS = ["software_vendor", "consumer", "finance", "shipping", "notifications", "personal", "unknown"] as const;

/** One decision per sending domain, from a handful of subjects. Shared across users. */
export const SenderVerdictSchema = z.object({
  verdict: z.enum(SENDER_VERDICTS),
  /** Normalized vendor name when verdict is software_vendor, else null. */
  vendor: z.string().nullable(),
  /** 0 to 1. */
  confidence: z.number(),
});
export type SenderVerdict = z.infer<typeof SenderVerdictSchema>;

export const VENDOR_SCOPES = ["work", "personal", "unknown"] as const;

/** One scope per vendor, for a batch of vendors. Shared across users. */
export const VendorScopesSchema = z.object({
  vendors: z.array(
    z.object({
      /** Echoed from the input, unchanged. */
      vendor_key: z.string(),
      scope: z.enum(VENDOR_SCOPES),
      /** 0 to 1. */
      confidence: z.number(),
    }),
  ),
});
export type VendorScopes = z.infer<typeof VendorScopesSchema>;
