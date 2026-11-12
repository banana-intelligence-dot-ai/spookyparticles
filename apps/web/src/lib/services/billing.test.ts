import { expect, it } from "vitest";
import { billByProject, billedServices, billingWindow, parseJsonLines, rowsForAccount, sellerOf } from "./billing";

it("sums outside sellers from billing rows and skips Vercel's own products", () => {
  const rows = parseJsonLines([
    JSON.stringify({ BilledCost: "12.50", BillingCurrency: "USD", ServiceProviderName: "Neon", ServiceName: "Neon Postgres", ServiceCategory: "Databases", Tags: { ProjectId: "prj_abc" } }),
    JSON.stringify({ BilledCost: 7.25, BillingCurrency: "USD", ServiceProviderName: "Neon", ServiceName: "Neon Postgres", Tags: { ProjectId: "prj_def" } }),
    "",
    JSON.stringify({ BilledCost: "20", BillingCurrency: "USD", ServiceProviderName: "Vercel", ServiceName: "Function Invocations" }),
    JSON.stringify({ BilledCost: "3", BillingCurrency: "USD", ServiceProviderName: "Vercel", ServiceName: "Upstash Redis" }),
    JSON.stringify({ BilledCost: "4", BillingCurrency: "USD", ServiceProviderName: "Inngest", ServiceCategory: "Developer Tools" }),
  ].join("\n"));
  expect(rows).toHaveLength(5);
  expect(billedServices(rows!)).toEqual([
    { key: "inngest", name: "Inngest", category: "developer tools", cents: 400, projectIds: [] },
    { key: "neon", name: "Neon", category: "database", cents: 1975, projectIds: ["prj_abc", "prj_def"] },
    { key: "upstash", name: "Upstash", category: "database", cents: 300, projectIds: [] },
  ]);
});

it("refuses a bill with any line that is not JSON, so a cut-off answer is never read as complete", () => {
  expect(parseJsonLines('{"BilledCost":"1"}\n{"BilledCost":"2"')).toBeNull();
  expect(parseJsonLines('{"BilledCost":"1"}\n\n')).toEqual([{ BilledCost: "1" }]);
});

it("matches seller names loosely but never Vercel's own catalog rows", () => {
  expect(sellerOf({ ServiceProviderName: "Supabase Inc." })?.key).toBe("supabase");
  expect(sellerOf({ ServiceProviderName: "Vercel", ServiceName: "Blob Storage" })).toBeNull();
  expect(sellerOf({ ServiceProviderName: "Vercel", ServiceName: "AI Gateway" })).toBeNull();
  expect(sellerOf({ ServiceProviderName: "<script>" })).toBeNull();
});

it("reads the last 30 whole days", () => {
  expect(billingWindow(Date.parse("2026-11-11T15:30:00Z"))).toEqual({ from: "2026-10-12T00:00:00.000Z", to: "2026-11-11T00:00:00.000Z" });
});

it("keeps the whole bill per project and product, Vercel's own included", () => {
  const rows = [
    { BilledCost: "20", BillingCurrency: "USD", ServiceProviderName: "Vercel", ServiceName: "Function Invocations", Tags: { ProjectId: "prj_a" } },
    { BilledCost: "5.5", BillingCurrency: "USD", ServiceProviderName: "Vercel", ServiceName: "Fast Data Transfer", Tags: { ProjectId: "prj_a" } },
    { BilledCost: "12.5", BillingCurrency: "USD", ServiceProviderName: "Neon", ServiceName: "Neon Postgres", Tags: { ProjectId: "prj_a" } },
    { BilledCost: "1", BillingCurrency: "USD", ServiceProviderName: "Vercel", ServiceName: "Function Invocations", Tags: { ProjectId: "prj_gone" } },
    { BilledCost: "20", BillingCurrency: "USD", ServiceProviderName: "Vercel", ServiceName: "Pro Plan" },
    { BilledCost: "9", BillingCurrency: "EUR", ServiceProviderName: "Vercel", ServiceName: "Pro Plan" },
    { BilledCost: "2", BillingCurrency: "USD", ServiceProviderName: "Vercel", ServiceName: "<img src=x>", Tags: { ProjectId: "prj_a" } },
  ];
  expect(billByProject(rows, new Set(["prj_a", "prj_b"]))).toEqual({
    projects: { prj_a: { cents: 4000, products: [{ name: "Function Invocations", cents: 2000 }, { name: "Neon Postgres", cents: 1250 }, { name: "Fast Data Transfer", cents: 550 }, { name: "Vercel", cents: 200 }] } },
    unassigned: { cents: 2100, products: [{ name: "Pro Plan", cents: 2000 }, { name: "Projects no longer listed", cents: 100 }] },
    chargedCents: 6100,
  });
});

it("counts the plan fee and credit-covered usage at effective cost, and charged apart", () => {
  const rows = [
    { BilledCost: 0, EffectiveCost: 0.6451612903, BillingCurrency: "USD", ServiceName: "Pro", Tags: {} },
    { BilledCost: 0, EffectiveCost: 1.5, BillingCurrency: "USD", ServiceName: "Build CPU Minutes", Tags: { ProjectId: "prj_a" } },
    { BilledCost: 3.12, EffectiveCost: 3.12, BillingCurrency: "USD", ServiceName: "Build CPU Minutes", Tags: { ProjectId: "prj_a" } },
  ];
  const bill = billByProject(rows, new Set(["prj_a"]));
  expect(bill.projects.prj_a.cents).toBe(462);
  expect(bill.unassigned).toEqual({ cents: 65, products: [{ name: "Pro", cents: 65 }] });
  expect(bill.chargedCents).toBe(312);
});

it("drops another account's rows, and says so when the whole answer is another account's bill", () => {
  const team = { BilledCost: "1", SubAccountId: "team_1" };
  expect(rowsForAccount([team], "user_1")).toBeNull();
  expect(rowsForAccount([team, { BilledCost: "2" }], "user_1")).toEqual([{ BilledCost: "2" }]);
  expect(rowsForAccount([team], "team_1")).toEqual([team]);
  expect(rowsForAccount([], "user_1")).toEqual([]);
});

it("keeps credits net instead of rounding a total up to zero", () => {
  const bill = billByProject([{ BilledCost: "5", ServiceName: "Builds", Tags: { ProjectId: "prj_a" } }, { BilledCost: "-8", ServiceName: "Credit", Tags: { ProjectId: "prj_a" } }], new Set(["prj_a"]));
  expect(bill.projects.prj_a.cents).toBe(-300);
});

it("folds products past the twelfth into Other", () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({ BilledCost: String(14 - i), ServiceName: `Product ${String.fromCharCode(65 + i)}`, Tags: { ProjectId: "prj_a" } }));
  const bill = billByProject(rows, new Set(["prj_a"])).projects.prj_a;
  expect(bill.products).toHaveLength(13);
  expect(bill.products.at(-1)).toEqual({ name: "Other", cents: 300 });
  expect(bill.cents).toBe(10500);
});
