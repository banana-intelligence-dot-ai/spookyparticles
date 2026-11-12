import { describe, expect, it } from "vitest";
import type { Tier2 } from "./schemas";
import { anchorsCarryNoValues, applyRecipe, parseDateLoose, recipeReproduces } from "./recipes";

const text = `Receipt from Vercel

Amount paid $20.00
Date paid October 1, 2026
Payment method Visa ending 4242

Summary
Pro plan, team "spooky-particles"
Oct 1 to Oct 31, 2026
1 × Pro seat $20.00

Subtotal $20.00
Tax $0.00
Amount paid $20.00

Receipt number 2847-1193`;

const recipe = {
  anchors: {
    amount: { pattern: "Amount paid\\s*\\$?([\\d,.]+)" },
    billed_at: { pattern: "Date paid\\s*([A-Za-z]+ \\d{1,2}, \\d{4})" },
    invoice_id: { pattern: "Receipt number\\s*#?\\s*([A-Za-z0-9-]+)" },
    card_last4: { pattern: "ending\\s*(\\d{4})" },
    project_name: { pattern: "team\\s*\"([^\"]+)\"" },
    tax: { pattern: "Tax\\s*\\$?([\\d,.]+)" },
  },
  defaults: { type: "receipt", vendor: "Vercel", cadence: "monthly", currency: "USD", plan: "Pro" },
};

const record: Tier2 = {
  type: "receipt", vendor: "Vercel", amount: "20.00", currency: "USD", tax: "0.00", total: null, billed_at: "2026-10-01", period_start: null, period_end: null, due_at: null,
  plan: "Pro", project_names: ["spooky-particles"], domain_names: [], account_email: null, card_last4: "4242", invoice_id: "2847-1193", status: "paid", cadence: "monthly", confidence: 0.95,
};

describe("parseDateLoose", () => {
  it("reads the common receipt date shapes", () => {
    expect(parseDateLoose("October 1, 2026")).toBe("2026-10-01");
    expect(parseDateLoose("Oct 1st, 2026")).toBe("2026-10-01");
    expect(parseDateLoose("11 Oct 2026")).toBe("2026-10-11");
    expect(parseDateLoose("2026-09-12T02:30:00Z")).toBe("2026-09-12");
    expect(parseDateLoose("10/01/2026")).toBe("2026-10-01");
    expect(parseDateLoose("soon")).toBeNull();
  });
});

describe("applyRecipe", () => {
  it("reads a receipt without a model", () => {
    const got = applyRecipe(recipe, text);
    expect(got).toMatchObject({ type: "receipt", vendor: "Vercel", amount: "20.00", currency: "USD", billed_at: "2026-10-01", invoice_id: "2847-1193", card_last4: "4242", plan: "Pro", cadence: "monthly" });
    expect(got?.project_names).toEqual(["spooky-particles"]);
  });

  it("returns null when the money anchor finds nothing, so the model takes over", () => {
    expect(applyRecipe(recipe, "Thanks for being a Vercel customer. Nothing to pay this month.")).toBeNull();
  });

  it("returns null when a date anchor captures something unparseable", () => {
    expect(applyRecipe({ ...recipe, anchors: { ...recipe.anchors, billed_at: { pattern: "Date paid\\s*(\\w+)" } } }, text)).toBeNull();
  });
});

describe("recipeReproduces and privacy", () => {
  it("accepts a recipe that reproduces the record", () => {
    expect(recipeReproduces(recipe, text, record)).toBe(true);
  });
  it("rejects a recipe whose amount disagrees", () => {
    expect(recipeReproduces({ ...recipe, anchors: { ...recipe.anchors, amount: { pattern: "Tax\\s*\\$?([\\d,.]+)" } } }, text, record)).toBe(false);
  });
  it("rejects patterns that carry values", () => {
    expect(anchorsCarryNoValues(recipe.anchors, record)).toBe(true);
    expect(anchorsCarryNoValues({ amount: { pattern: "2847-1193\\s*([\\d.]+)" } }, record)).toBe(false);
    expect(anchorsCarryNoValues({ account_email: { pattern: "nate@example.com\\s*(.+)" } }, record)).toBe(false);
    expect(anchorsCarryNoValues({ invoice_id: { pattern: "id\\s*(\\d{6})12345678" } }, record)).toBe(false);
  });
});
