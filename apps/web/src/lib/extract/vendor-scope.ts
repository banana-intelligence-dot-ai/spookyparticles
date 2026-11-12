/**
 * Work or personal, per vendor. Resolution order:
 * 1. The Tier 0 sender table: any known vendor is work.
 * 2. The cached verdict in vendor_verdicts (shared by every user).
 * 3. One Haiku call for the rest, up to 40 vendors at a time, then cached.
 *
 * Receipts from senders already judged consumer, finance, shipping or personal
 * never reach this point (loadReceipts leaves them out). A vendor name, a few
 * plan names and subject shapes are all the model sees; no amounts, no addresses.
 */
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Receipt } from "@/db/schema";
import { vendorCategory, vendorKey, type VendorScope } from "../spend";
import { classifyVendors, type VendorScopeInput } from "./claude";

type Row = Receipt & { subject?: string | null };

/** Digits and ids blanked: "Receipt #4471 for $20" becomes "Receipt # for $". */
function subjectShape(subject: string): string {
  return subject.replace(/[#:]?\s*[a-z0-9_-]*\d[a-z0-9_-]*/gi, " #").replace(/\s+/g, " ").trim();
}

export async function resolveVendorScopes(rows: Row[]): Promise<Map<string, VendorScope>> {
  const scopes = new Map<string, VendorScope>();
  const pending = new Map<string, VendorScopeInput>();

  for (const r of rows) {
    if (r.kind !== "receipt" || r.amountCents === null || r.amountCents <= 0) continue;
    const key = vendorKey(r.vendor, r.plan);
    if (scopes.has(key) || pending.has(key)) {
      const p = pending.get(key);
      if (p) {
        if (r.plan && !p.plans.includes(r.plan) && p.plans.length < 3) p.plans.push(r.plan);
        if (r.subject && p.subjects.length < 2) {
          const shape = subjectShape(r.subject);
          if (!p.subjects.includes(shape)) p.subjects.push(shape);
        }
      }
      continue;
    }
    if (vendorCategory(r.vendor) !== "other") {
      scopes.set(key, "work");
      continue;
    }
    pending.set(key, {
      vendorKey: key,
      vendor: r.vendor,
      plans: r.plan ? [r.plan] : [],
      subjects: r.subject ? [subjectShape(r.subject)] : [],
    });
  }
  if (!pending.size) return scopes;

  const db = getDb();
  const cached = await db
    .select()
    .from(schema.vendorVerdicts)
    .where(inArray(schema.vendorVerdicts.vendorKey, [...pending.keys()]));
  for (const c of cached) {
    scopes.set(c.vendorKey, c.scope);
    pending.delete(c.vendorKey);
  }
  if (!pending.size) return scopes;

  const batch = [...pending.values()];
  for (let i = 0; i < batch.length; i += 40) {
    const slice = batch.slice(i, i + 40);
    const r = await classifyVendors(slice);
    if (!r.ok) {
      console.error("[vendor-scope] classify failed", r.reason);
      for (const v of slice) scopes.set(v.vendorKey, "unknown");
      continue;
    }
    const byKey = new Map(r.value.vendors.map((v) => [v.vendor_key, v]));
    const toInsert: (typeof schema.vendorVerdicts.$inferInsert)[] = [];
    for (const v of slice) {
      const got = byKey.get(v.vendorKey);
      const scope: VendorScope = got?.scope ?? "unknown";
      scopes.set(v.vendorKey, scope);
      if (got) toInsert.push({ vendorKey: v.vendorKey, vendor: v.vendor, scope, confidence: got.confidence, model: r.usage.model });
    }
    if (toInsert.length) await db.insert(schema.vendorVerdicts).values(toInsert).onConflictDoNothing();
  }
  return scopes;
}
