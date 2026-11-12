/**
 * Billing mail by vendor, from stored headers only. The first result a user
 * sees, minutes after connecting, before any extraction has run: which vendors
 * bill them, how often, and when last. Pure grouping; the API route feeds it rows.
 */
import { SENDERS, type SenderCategory } from "@spooky/tier0";
import type { HeaderView } from "./gmail/messages";
import { classifyHeader } from "./tier0";

export type VendorRow = HeaderView & { connectionId: string };

export type VendorSummary = {
  /** Vendor name from the Tier 0 sender table, display-ready, e.g. "Vercel". */
  vendor: string;
  category: SenderCategory | null;
  messages: number;
  /** How many connected inboxes this vendor writes to. */
  inboxes: number;
  firstAt: string | null;
  lastAt: string | null;
};

export type VendorsReport = {
  vendors: VendorSummary[];
  /** Candidate messages the sender table does not name (receipt subjects, attachments). */
  unmatched: number;
  /** Rows that were looked at. */
  messages: number;
};

const CATEGORY = new Map<string, SenderCategory>(SENDERS.map((s) => [s.vendor, s.category]));

/** The vendor named in a stored tier0 reason like "known_sender:Vercel", or null. */
export function vendorFromReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const m = /^known_sender:(.+)$/.exec(reason);
  return m ? m[1] : null;
}

export function groupVendors(rows: VendorRow[]): VendorsReport {
  const byVendor = new Map<string, { messages: number; inboxes: Set<string>; first: Date | null; last: Date | null }>();
  let unmatched = 0;

  for (const row of rows) {
    const verdict = classifyHeader(row);
    const vendor = vendorFromReason(verdict.reason);
    if (!vendor) {
      unmatched += 1;
      continue;
    }
    const v = byVendor.get(vendor) ?? { messages: 0, inboxes: new Set<string>(), first: null, last: null };
    v.messages += 1;
    v.inboxes.add(row.connectionId);
    if (row.date) {
      if (!v.first || row.date < v.first) v.first = row.date;
      if (!v.last || row.date > v.last) v.last = row.date;
    }
    byVendor.set(vendor, v);
  }

  const vendors = [...byVendor.entries()]
    .map(([vendor, v]) => ({
      vendor,
      category: CATEGORY.get(vendor) ?? null,
      messages: v.messages,
      inboxes: v.inboxes.size,
      firstAt: v.first?.toISOString() ?? null,
      lastAt: v.last?.toISOString() ?? null,
    }))
    .sort((a, b) => b.messages - a.messages || a.vendor.localeCompare(b.vendor));

  return { vendors, unmatched, messages: rows.length };
}
