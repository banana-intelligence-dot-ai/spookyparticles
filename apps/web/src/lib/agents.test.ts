import { describe, expect, it } from "vitest";
import type { Catch } from "./catches";
import type { Claim } from "./claims";
import { buildAgents } from "./agents";

const now = Date.parse("2026-11-12T12:00:00Z");
const at = (minutes: number) => new Date(now - minutes * 60_000);
const iso = (minutes: number) => at(minutes).toISOString();
type Input = Parameters<typeof buildAgents>[0];
const key = (id: string, extra: Partial<Input["keys"][number]> = {}): Input["keys"][number] => ({
  id, name: id, prefix: id, scopes: ["read"], createdAt: at(1000), lastUsedAt: null,
  revokedAt: null, expiresAt: null, ...extra,
});
const caught = (id: string, agentKeyId: string | null, extra: Partial<Catch> = {}): Catch => ({
  id, kind: "deploy", project: "me/app", what: id, caughtAt: iso(60), alertedAt: null,
  heardAt: iso(30), agent: null, agentKeyId, fixedAt: iso(10), fixedBy: null,
  status: "fixed", note: null, clearKey: id, ...extra,
});
const input = (extra: Partial<Input> = {}): Input => ({ keys: [], reads: [], claims: [], catches: [], unheard: [], now, ...extra });

describe("buildAgents", () => {
  it("marks live, expired, and revoked keys and sorts by state", () => {
    const agents = buildAgents(input({ keys: [
      key("revoked", { revokedAt: at(1), lastUsedAt: at(1) }),
      key("expired", { expiresAt: at(1), lastUsedAt: at(2) }),
      key("live", { expiresAt: at(-1), lastUsedAt: at(10) }),
    ] })).agents;
    expect(agents.map((a) => [a.id, a.state])).toEqual([["live", "live"], ["expired", "expired"], ["revoked", "revoked"]]);
  });

  it("puts the most recently used live key first", () => {
    const agents = buildAgents(input({ keys: [key("older", { lastUsedAt: at(20) }), key("newer", { lastUsedAt: at(2) })] })).agents;
    expect(agents.map((a) => a.id)).toEqual(["newer", "older"]);
  });

  it("keeps only the newest read per project", () => {
    const reads = [30, 5].map((minutes) => ({ project: "me/app", apiKeyId: "a", at: at(minutes) }));
    const agent = buildAgents(input({ keys: [key("a")], reads })).agents[0];
    expect(agent.asked).toEqual([{ project: "me/app", at: iso(5) }]);
    expect(agent.askedTotal).toBe(1);
  });

  it("caps asked projects at eight while reporting the full total", () => {
    const reads = Array.from({ length: 10 }, (_, i) => ({ project: `me/p${i}`, apiKeyId: "a", at: at(i) }));
    const agent = buildAgents(input({ keys: [key("a")], reads })).agents[0];
    expect(agent.asked.map((a) => a.project)).toEqual(reads.slice(0, 8).map((r) => r.project));
    expect(agent.askedTotal).toBe(10);
  });

  it("assigns reads and claims by key id", () => {
    const claims: Claim[] = [{ project: "me/app", apiKeyId: "b", agent: "b", at: iso(10), until: iso(-20) }];
    const report = buildAgents(input({ keys: [key("a"), key("b")], reads: [{ project: "me/app", apiKeyId: "a", at: at(5) }], claims }));
    expect(report.agents.find((a) => a.id === "a")).toMatchObject({ askedTotal: 1, claims: [] });
    expect(report.agents.find((a) => a.id === "b")?.claims).toEqual([{ project: "me/app", at: iso(10), until: iso(-20) }]);
  });

  it("counts fixed catches by key id and selects the latest fix", () => {
    const report = buildAgents(input({ keys: [key("a"), key("b")], catches: [
      caught("old", "a", { fixedAt: iso(20) }), caught("new", "a", { fixedAt: iso(5) }),
      caught("other", "b"), caught("open", "a", { status: "open", fixedAt: null }),
    ] }));
    expect(report.agents.find((a) => a.id === "a")).toMatchObject({ fixed: 2, lastFix: { what: "new", fixedAt: iso(5) } });
    expect(report.agents.find((a) => a.id === "b")?.fixed).toBe(1);
  });

  it("summarizes live, fixed, and listening agents and passes unheard projects through", () => {
    const unheard = [{ project: "me/other", open: 2 }];
    const report = buildAgents(input({ keys: [key("a"), key("b"), key("old", { expiresAt: at(1) })], reads: [
      { project: "me/app", apiKeyId: "a", at: at(5) }, { project: "me/app", apiKeyId: "old", at: at(5) },
    ], catches: [caught("fix", "b")], unheard }));
    expect(report.summary).toEqual({ live: 2, fixed: 1, listening: 1 });
    expect(report.unheard).toEqual(unheard);
    expect(report.checkedAt).toBe(iso(0));
  });
});
