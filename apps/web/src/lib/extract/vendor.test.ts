import { describe, expect, it } from "vitest";
import { canonicalVendor, cleanVendorName } from "./vendor";

describe("cleanVendorName", () => {
  it("applies aliases and strips legal suffixes", () => {
    expect(cleanVendorName("Fathom Analytics")).toBe("Fathom");
    expect(cleanVendorName("Vercel Inc.")).toBe("Vercel");
    expect(cleanVendorName("Namecheap, Inc.")).toBe("Namecheap");
    expect(cleanVendorName("Amazon Web Services")).toBe("AWS");
    expect(cleanVendorName("Raycast")).toBe("Raycast");
  });
});

describe("canonicalVendor", () => {
  it("trusts the sender table for a known vendor address", () => {
    expect(canonicalVendor({ modelVendor: "Vercel Inc", tier1Vendor: "Vercel", fromAddress: "invoice+statements@vercel.com" })).toBe("Vercel");
  });
  it("keeps the product for processor and platform receipts", () => {
    expect(canonicalVendor({ modelVendor: "Loom", tier1Vendor: "Loom", fromAddress: "receipts+acct_1@stripe.com" })).toBe("Loom");
    expect(canonicalVendor({ modelVendor: "Spotify", tier1Vendor: null, fromAddress: "no_reply@email.apple.com" })).toBe("Spotify");
    expect(canonicalVendor({ modelVendor: "Apple Ads", tier1Vendor: null, fromAddress: "apple_ads@email.apple.com" })).toBe("Apple Ads");
    expect(canonicalVendor({ modelVendor: "unknown", tier1Vendor: null, fromAddress: "no_reply@email.apple.com" })).toBe("Apple App Store Connect");
  });
  it("falls back to the model, then Tier 1, then unknown", () => {
    expect(canonicalVendor({ modelVendor: "Fathom Analytics", tier1Vendor: "Fathom", fromAddress: "billing@usefathom.com" })).toBe("Fathom");
    expect(canonicalVendor({ modelVendor: "unknown", tier1Vendor: "Raycast", fromAddress: "help@paddle.com" })).toBe("Raycast");
    expect(canonicalVendor({ modelVendor: null, tier1Vendor: null, fromAddress: "x@nowhere.example" })).toBe("unknown");
  });
});
