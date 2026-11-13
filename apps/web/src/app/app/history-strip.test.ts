import { describe, expect, it } from "vitest";
import { STRIP_DAYS, stripDays } from "./history-strip";

describe("stripDays", () => {
  it("makes 30 local days ending today and counts signals by tone", () => {
    const now = new Date(2026, 10, 12, 15, 0).getTime();
    const at = (d: number, h = 10) => new Date(2026, 10, d, h).toISOString();
    const days = stripDays(
      [
        { at: at(12), tone: "red", label: "Failed deploys", cents: null },
        { at: at(12, 1), tone: null, label: "Billing", cents: 2000 },
        { at: at(11), tone: "amber", label: "Incidents", cents: null },
        { at: new Date(2026, 8, 1).toISOString(), tone: "red", label: "Security", cents: null },
      ],
      now,
    );
    expect(days).toHaveLength(STRIP_DAYS);
    expect(new Date(days[0].start).getDate()).toBe(14);
    const today = days.at(-1)!;
    expect([today.red, today.amber, today.quiet]).toEqual([1, 0, 1]);
    expect(days.at(-2)!.amber).toBe(1);
    expect(days.reduce((n, d) => n + d.red, 0)).toBe(1);
  });
});
