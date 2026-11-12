import { describe, expect, it } from "vitest";
import { billRows, cleanServiceInput, serviceRows } from "./model";

it("validates and cleans a recorded service", () => {
  expect(cleanServiceInput({ project: " team/app ", service: " Stripe ", monthlyCostUsd: 12.34, note: " hi\u0000 there " }))
    .toMatchObject({ project: "team/app", key: "stripe", monthlyCostCents: 1234, note: "hi there" });
  expect(() => cleanServiceInput({ project: "team/app", service: "Stripe", monthlyCostUsd: -1 })).toThrow();
  expect(() => cleanServiceInput({ project: "team/app", service: "Stripe", monthlyCostUsd: 1.234 })).toThrow();
  expect(() => cleanServiceInput({ project: "", service: "Stripe" })).toThrow();
});

it("groups project edges, flags sharing, judges use and cost, and hides orphan nodes", () => {
  const date = new Date("2026-11-10T00:00:00Z");
  const nowMs = Date.parse("2026-11-11T00:00:00Z");
  const { services, shares } = serviceRows(
    [{ id: "s", name: "Stripe", externalKey: "service:stripe", attributes: { category: "payments" }, monthlyCostCents: 1000 }, { id: "orphan", name: "Old", externalKey: "service:old", attributes: {}, monthlyCostCents: null },
      { id: "n", name: "Neon", externalKey: "service:neon", attributes: { category: "database", costs: { vercel_billing: { cents: 1900, from: "2026-10-11T00:00:00.000Z", to: "2026-11-10T00:00:00.000Z", at: "2026-11-10T00:00:00Z", scopes: { "team:t": 1900 } } } }, monthlyCostCents: 1900 },
      { id: "u", name: "Supabase", externalKey: "service:supabase", attributes: { category: "database" }, monthlyCostCents: null }],
    [{ id: "p1", name: "app-one", externalKey: "vercel:project:prj_1", attributes: { scope_slug: "team" } }, { id: "p2", name: "app-two", externalKey: "vercel:project:prj_2", status: "paused", attributes: { scope_slug: "team", paused: true } }],
    [{ fromNodeId: "p1", toNodeId: "s", provenance: { source: "vercel" }, lastSeenAt: date }, { fromNodeId: "p2", toNodeId: "s", provenance: { source: "manual" }, lastSeenAt: date },
      { fromNodeId: "p1", toNodeId: "n", provenance: { source: "vercel", call: "GET /v1/billing/charges" }, lastSeenAt: date }, { fromNodeId: "p2", toNodeId: "u", provenance: { source: "vercel" }, lastSeenAt: date }],
    { productionAt: new Map([["prj_1", "2026-11-05T00:00:00.000Z"]]), billingReadable: false, nowMs },
  );
  expect(services.map((s) => s.name)).toEqual(["Neon", "Stripe", "Supabase"]);
  expect(services[1]).toMatchObject({ id: "s", key: "stripe", category: "payments", projects: ["team/app-one", "team/app-two"], sources: ["manual", "vercel"], monthlyCostUsd: 10, costSource: "recorded by agent", lastSeenAt: date.toISOString(), shared: true });
  expect(services[1].usage).toMatchObject({ state: "in_use", basis: "In use: team/app-one (production deploy 2026-11-05)." });
  expect(services[0]).toMatchObject({ sources: ["vercel_billing"], monthlyCostUsd: 19, costSource: "vercel billing" });
  expect(services[2]).toMatchObject({ monthlyCostUsd: null, costSource: null, costNote: "Unknown. Vercel billing is not readable with this connection and nobody recorded a cost." });
  expect(services[2].usage).toMatchObject({ state: "idle", basis: "Idle: team/app-two (paused on Vercel)." });
  expect(shares.map((s) => s.line)).toEqual(["These projects could share one database: team/app-one (Neon), team/app-two (Supabase)."]);
});

describe("billRows", () => {
  const account = (billing: unknown) => ({ name: "acme (Vercel team)", externalKey: "vercel:account:team_1", attributes: { billing } });
  const project = (name: string, bill: unknown, scope = "team_1") => ({ id: name, name, attributes: { scope_id: scope, scope_slug: "acme", vercel_bill: bill } });
  const read = { state: "read", from: "2026-10-12T00:00:00.000Z", to: "2026-11-11T00:00:00.000Z", at: "2026-11-11T10:00:00.000Z", unassigned: { cents: 2000, products: [{ name: "Pro Plan", cents: 2000 }] } };

  it("lists each project's bill from the same read, biggest first, plus what no project carries", () => {
    const out = billRows([
      project("web", { cents: 4000, products: [{ name: "Function Invocations", cents: 4000 }], from: read.from }),
      project("api", { cents: 0, products: [], from: read.from }),
      project("old", { cents: 999, products: [], from: "2026-09-01T00:00:00.000Z" }),
      project("other-team", { cents: 100, products: [], from: read.from }, "team_2"),
    ], [account(read)]);
    expect(out.accounts).toEqual([{ account: "acme (Vercel team)", from: read.from, to: read.to, totalUsd: 60, chargedUsd: null,
      projects: [{ project: "acme/web", usd: 40, products: [{ name: "Function Invocations", usd: 40 }] }, { project: "acme/api", usd: 0, products: [] }],
      unassigned: { usd: 20, products: [{ name: "Pro Plan", usd: 20 }] } }]);
  });

  it("shows nothing for an account whose billing was not read", () => {
    expect(billRows([project("web", { cents: 4000, products: [], from: read.from })], [account({ state: "not_readable", at: read.at })]).accounts).toEqual([]);
  });
});
