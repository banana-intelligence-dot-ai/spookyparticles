import { expect, it } from "vitest";
import { chosenCost, mergeBilling, readCosts, recordCost, unknownCostNote } from "./cost";

const now = Date.parse("2026-11-11T12:00:00Z");
const period = { from: "2026-10-12T00:00:00.000Z", to: "2026-11-11T00:00:00.000Z" };

it("shows Vercel billing first, then the person, then the agent", () => {
  let costs = recordCost({}, "agent", 500, "2026-11-01T00:00:00Z");
  expect(chosenCost(costs, now)).toMatchObject({ cents: 500, source: "recorded by agent" });
  costs = recordCost(costs, "you", 700, "2026-11-02T00:00:00Z");
  expect(chosenCost(costs, now)).toMatchObject({ cents: 700, source: "recorded by you" });
  costs = mergeBilling(costs, "team_a", 1900, period, "2026-11-11T00:00:00Z");
  expect(chosenCost(costs, now)).toEqual({ cents: 1900, source: "vercel billing", note: "Vercel billing, 2026-10-12 to 2026-11-11" });
  // An agent writing later never hides what the person or the bill said.
  expect(chosenCost(recordCost(costs, "agent", 1, "2026-11-11T01:00:00Z"), now)?.cents).toBe(1900);
});

it("never invents a cost and says why it is unknown", () => {
  expect(chosenCost({}, now)).toBeNull();
  expect(unknownCostNote(false)).toContain("not readable");
  expect(unknownCostNote(true)).toContain("no charge for it");
});

it("sums billing across scopes, drops a scope that stopped billing, and ages out an old bill", () => {
  let costs = mergeBilling({}, "team_a", 1000, period, "2026-11-11T00:00:00Z");
  costs = mergeBilling(costs, "team_b", 250, period, "2026-11-11T00:00:00Z");
  expect(costs.vercel_billing?.cents).toBe(1250);
  costs = mergeBilling(costs, "team_a", null, period, "2026-11-11T00:00:00Z");
  expect(costs.vercel_billing?.cents).toBe(250);
  expect(mergeBilling(costs, "team_b", null, period, "2026-11-11T00:00:00Z").vercel_billing).toBeUndefined();
  expect(chosenCost(mergeBilling({}, "team_a", 900, period, "2026-08-01T00:00:00Z"), now)).toBeNull();
});

it("reads a cost saved before sources were kept as an agent record", () => {
  expect(readCosts({}, 1234)).toEqual({ agent: { cents: 1234, at: "" } });
  expect(readCosts({ costs: { you: { cents: 5, at: "x" } } }, 5)).toEqual({ you: { cents: 5, at: "x" } });
  expect(readCosts({}, null)).toEqual({});
});
