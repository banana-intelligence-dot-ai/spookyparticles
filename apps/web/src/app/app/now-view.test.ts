import { describe, expect, it } from "vitest";
import type { OpenReport } from "@/lib/open-items";
import { fixedLine, nowLead } from "./now-view";
import { pairLength } from "./pair";
import { isActive, MORE, RAIL_ITEMS } from "./rail";

const summary = (over: Partial<OpenReport["summary"]> = {}): OpenReport["summary"] => ({
  open: 0, onYou: 0, withAgents: 0, fixed: 0, fixedByAgents: 0, medianFixMinutes: null, watching: 3, notWatched: 0, agents: 1, windowDays: 30, ...over,
});

describe("the Now headline", () => {
  it("counts what is on the owner, and says what the agents hold", () => {
    expect(nowLead(summary({ open: 5, onYou: 3, withAgents: 2, agents: 2 }))).toEqual({ headline: "Three things need you.", sub: "Your agents have 2." });
    expect(nowLead(summary({ open: 1, onYou: 1 }))).toEqual({ headline: "One thing needs you.", sub: "" });
  });
  it("is calm when only the agents hold work, and calmer when nothing is open", () => {
    expect(nowLead(summary({ open: 1, withAgents: 1 }))).toEqual({ headline: "Nothing needs you.", sub: "Your agent has 1." });
    expect(nowLead(summary())).toEqual({ headline: "Nothing is open.", sub: "" });
  });
});

describe("the fixed line", () => {
  it("gives the count, the agents' share and the median", () => {
    expect(fixedLine(summary({ fixed: 6, fixedByAgents: 5, medianFixMinutes: 42 }))).toBe("6 fixed in the last 30 days, 5 with an agent on it. Median fix 42 min.");
  });
  it("leaves out what it does not know", () => {
    expect(fixedLine(summary({ fixed: 2 }))).toBe("2 fixed in the last 30 days.");
    expect(fixedLine(summary())).toBe("Nothing broke in the last 30 days that Spooky saw.");
  });
});

describe("the pair's line", () => {
  it("grows with the time to fix, on a log scale, inside its bounds", () => {
    const min = pairLength(null);
    expect(pairLength(1)).toBe(min);
    expect(pairLength(5 * 60_000)).toBeLessThan(pairLength(3 * 3_600_000));
    expect(pairLength(3 * 3_600_000)).toBeLessThan(pairLength(3 * 86_400_000));
    expect(pairLength(365 * 86_400_000)).toBe(pairLength(10 * 365 * 86_400_000));
  });
});

describe("the rail", () => {
  it("lights exactly one place for every page", () => {
    const pages = ["/app", "/app/history", "/app/projects/octocat/ledger-api", "/app/agents", "/app/settings", ...MORE.map((m) => m.href)];
    for (const page of pages) expect(RAIL_ITEMS.filter((i) => isActive(i.href, page)).length, page).toBe(1);
  });
  it("keeps Now for /app only, and gives Settings the pages it links to", () => {
    expect(isActive("/app", "/app/history")).toBe(false);
    expect(isActive("/app/settings", "/app/jobs")).toBe(true);
    expect(isActive("/app/settings", "/app/check/abc")).toBe(true);
  });
});
