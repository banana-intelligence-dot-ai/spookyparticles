import { describe, expect, it } from "vitest";
import type { Check, CheckProject } from "./check-view";
import { cellOf, matrixRows } from "./check-matrix";

const c = (check: string, state: string, more: Partial<Check> = {}): Check =>
  ({ id: check, check, state, reason: null, source: "verified", name: check, title: check, why: "", fix: { text: "", docUrl: "" }, evidence: {}, firstOpenAt: null, fixedAt: null, dismissedAt: null, checkedAt: null, ...more }) as Check;
const p = (name: string, checks: Check[]): CheckProject => ({ nodeId: name, name, productionUrl: null, checks });

describe("check matrix", () => {
  it("names each square by what it asks of you", () => {
    expect(cellOf(c("a", "open", { severity: "exposed" }))).toBe("exposed");
    expect(cellOf(c("a", "open"))).toBe("open");
    expect(cellOf(c("a", "open", { dismissedAt: "2026-11-01T00:00:00Z" }))).toBe("dismissed");
    expect(cellOf(c("a", "ok", { fixedAt: "2026-11-01T00:00:00Z" }))).toBe("fixed");
    expect(cellOf(c("a", "ok"))).toBe("ok");
    expect(cellOf(c("a", "not_applicable"))).toBe("not_applicable");
    expect(cellOf(c("a", "weird"))).toBe("unknown");
    expect(cellOf(undefined)).toBe("none");
  });

  it("puts exposed first, then most open, then unchecked, then clear", () => {
    const rows = matrixRows([
      p("clear", [c("a", "ok")]),
      p("partial", [c("a", "unknown")]),
      p("two-open", [c("a", "open"), c("b", "open")]),
      p("exposed", [c("a", "open", { severity: "exposed" })]),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["exposed", "two-open", "partial", "clear"]);
  });
});
