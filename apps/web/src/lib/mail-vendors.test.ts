import { describe, expect, it } from "vitest";
import { groupVendors, vendorFromReason, type VendorRow } from "./mail-vendors";

const row = (over: Partial<VendorRow>): VendorRow => ({
  connectionId: "c1",
  from: "Vercel <invoice+statements@vercel.com>",
  replyTo: null,
  subject: "Your receipt from Vercel",
  date: new Date("2026-10-01T00:00:00Z"),
  listUnsubscribe: false,
  labels: ["INBOX"],
  attachmentNames: [],
  ...over,
});

describe("groupVendors", () => {
  it("counts messages, inboxes and the date range per vendor, biggest first", () => {
    const r = groupVendors([
      row({}),
      row({ connectionId: "c2", date: new Date("2026-10-20T00:00:00Z") }),
      row({ from: "Supabase <billing@supabase.com>", subject: "Your Supabase invoice", date: new Date("2026-09-01T00:00:00Z") }),
    ]);
    expect(r.messages).toBe(3);
    expect(r.vendors.map((v) => v.vendor)).toEqual(["Vercel", "Supabase"]);
    const vercel = r.vendors[0];
    expect(vercel.messages).toBe(2);
    expect(vercel.inboxes).toBe(2);
    expect(vercel.firstAt).toBe("2026-10-01T00:00:00.000Z");
    expect(vercel.lastAt).toBe("2026-10-20T00:00:00.000Z");
    expect(vercel.category).toBe("hosting");
  });

  it("keeps receipts from unknown senders as unmatched, never as a vendor", () => {
    const r = groupVendors([row({ from: "Some Shop <orders@someshop.example>", subject: "Your receipt #4411" })]);
    expect(r.vendors).toEqual([]);
    expect(r.unmatched).toBe(1);
  });

  it("reads the vendor out of a stored reason", () => {
    expect(vendorFromReason("known_sender:Vercel")).toBe("Vercel");
    expect(vendorFromReason("query:q3")).toBeNull();
    expect(vendorFromReason(null)).toBeNull();
  });
});
