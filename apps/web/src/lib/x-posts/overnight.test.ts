import { describe, expect, it } from "vitest";
import type { Catch } from "@/lib/catches";
import { lineChecks, planXPost } from "./plan";
import { nightWindow, overnightStats, overnightText } from "./overnight";
import { PRIVATE_PROJECT_TERMS } from "./private-terms";

const c = (o: Partial<Catch>): Catch => ({ id: Math.random().toString(36), kind: "job", project: "app", what: "x", caughtAt: "", alertedAt: null, heardAt: null, agent: null, fixedAt: null, fixedBy: null, status: "open", note: null, clearKey: "k", ...o });
// Mon Nov 23 2026, 9:05am PST = 17:05 UTC. The night is Sun 8pm PST (04:00Z Mon) to Mon 8am PST (16:00Z).
const now = Date.parse("2026-11-23T17:05:00Z");

describe("overnight line", () => {
  it("finds the Pacific night that ended at 8am today", () => {
    const w = nightWindow(now);
    expect(new Date(w.start).toISOString()).toBe("2026-11-23T04:00:00.000Z");
    expect(new Date(w.end).toISOString()).toBe("2026-11-23T16:00:00.000Z");
    expect(w.label).toBe("Mon Nov 23");
    // Clock-change Sundays: 8am is after the 2am switch both ways.
    expect(new Date(nightWindow(Date.parse("2027-03-14T16:05:00Z")).end).toISOString()).toBe("2027-03-14T15:00:00.000Z");
    expect(new Date(nightWindow(Date.parse("2027-03-14T16:05:00Z")).start).toISOString()).toBe("2027-03-14T04:00:00.000Z");
    expect(new Date(nightWindow(Date.parse("2026-11-01T17:05:00Z")).end).toISOString()).toBe("2026-11-01T16:00:00.000Z");
    expect(new Date(nightWindow(Date.parse("2026-11-01T17:05:00Z")).start).toISOString()).toBe("2026-11-01T03:00:00.000Z");
    // Summer time: 8am PDT is 15:00Z.
    expect(new Date(nightWindow(Date.parse("2026-07-01T16:05:00Z")).end).toISOString()).toBe("2026-07-01T15:00:00.000Z");
  });

  it("counts night episodes, back to green by 8am, and leaves out closed projects", () => {
    const list = [
      c({ caughtAt: "2026-11-23T05:00:00Z", status: "fixed", fixedAt: "2026-11-23T06:00:00Z" }),
      c({ caughtAt: "2026-11-23T07:00:00Z", status: "fixed", fixedAt: "2026-11-23T16:30:00Z" }),
      c({ caughtAt: "2026-11-23T08:00:00Z", status: "open" }),
      c({ caughtAt: "2026-11-23T08:00:00Z", status: "ignored" }),
      c({ caughtAt: "2026-11-20T08:00:00Z", status: "fixed", fixedAt: "2026-11-20T09:00:00Z" }),
      // Caught over 30 days ago and fixed inside them: not in the 30-day count.
      c({ caughtAt: "2026-10-01T08:00:00Z", status: "fixed", fixedAt: "2026-11-01T09:00:00Z" }),
    ];
    const s = overnightStats(list, false, now)!;
    expect(s).toMatchObject({ night: 3, nightGreen: 1, caught: 4, green: 3 });
    const text = overnightText(s);
    expect(text).toBe(`Overnight on our own apps, Spooky Particles caught 3 problems, and 1 is back to green by 8am. Last 30 days: 4 caught, 3 back to green, median ${s.medianMinutes} minutes to green. Mon Nov 23.`);
    expect(lineChecks(text).every((x) => x.ok)).toBe(true);
  });

  it.skipIf(PRIVATE_PROJECT_TERMS.length === 0)("leaves out private projects", () => {
    const list = [
      c({ caughtAt: "2026-11-23T08:00:00Z", status: "open" }),
      c({ caughtAt: "2026-11-23T08:00:00Z", status: "open", project: `my-${PRIVATE_PROJECT_TERMS[0]}-bot` }),
    ];
    expect(overnightStats(list, false, now)).toMatchObject({ night: 1, caught: 1 });
  });

  it("is null when the list may be cut short or the night has not ended", () => {
    expect(overnightStats([], true, now)).toBeNull();
    expect(overnightStats([], false, Date.parse("2026-11-23T15:00:00Z"))).toBeNull();
  });

  it("says a night with nothing fixed yet plainly", () => {
    expect(overnightText({ night: 1, nightGreen: 0, caught: 5, green: 4, medianMinutes: 30, label: "Mon Nov 23" }))
      .toBe("Overnight on our own apps, Spooky Particles caught 1 problem, and none are back to green by 8am. Last 30 days: 5 caught, 4 back to green, median 30 minutes to green. Mon Nov 23.");
  });

  it("says a quiet night plainly", () => {
    expect(overnightText({ night: 0, nightGreen: 0, caught: 5, green: 5, medianMinutes: 1, label: "Mon Nov 23" }))
      .toBe("Overnight on our own apps, Spooky Particles caught 0 problems. Last 30 days: 5 caught, 5 back to green, median 1 minute to green. Mon Nov 23.");
  });

  it("leads with the count, blocks only an exact repeat, and falls back to the queue without it", () => {
    const line = overnightText({ night: 2, nightGreen: 2, caught: 9, green: 8, medianMinutes: 40, label: "Tue Nov 24" });
    const yesterday = line.replace("Tue Nov 24", "Mon Nov 23");
    const queue = [{ text: "A queued feature line.", checked: "2026-11-19", source: "llms.txt" }];
    expect(planXPost({ on: true, keysPresent: true, queue, posted: [yesterday], others: [], overnight: line })).toMatchObject({ action: "post", text: line });
    expect(planXPost({ on: true, keysPresent: true, queue, posted: [line], others: [], overnight: line })).toMatchObject({ action: "skip", reason: "check_failed" });
    expect(planXPost({ on: true, keysPresent: true, queue, posted: [], others: [], overnight: null })).toMatchObject({ action: "post", text: queue[0].text });
    expect(planXPost({ on: true, keysPresent: true, queue, posted: [], others: null, overnight: line })).toMatchObject({ action: "skip", reason: "check_failed" });
  });
});
