import { describe, expect, it } from "vitest";
import { dueProbeOccurrence, judge, todayInTimeZone, validateOutcomeInput } from "./probes";

const schedule = "35 7 * * 1-5";
const zone = "America/New_York";
const date = (s: string) => Date.parse(s);

describe("probe rules", () => {
  it("compares every operator, today and nested paths", () => {
    const body = { date: "2026-11-13", data: { count: 2, items: [{ count: 2 }] }, active: true };
    expect(judge(body, [
      { path: "date", op: "eq", value: "$today" },
      { path: "data.count", op: "gte", value: 2 },
      { path: "data.count", op: "lte", value: 2 },
      { path: "data.count", op: "gt", value: 1 },
      { path: "data.count", op: "lt", value: 3 },
      { path: "active", op: "exists" },
      { path: "data.items.0.count", op: "eq", value: 2 },
    ], "2026-11-13")).toEqual({ ok: true, note: "" });
    expect(todayInTimeZone(date("2026-11-13T02:00:00Z"), zone)).toBe("2026-11-12");
  });
  it("reports only failed rules and caps values and the note", () => {
    const result = judge({ date: null, sentCount: 0, long: "x".repeat(500) }, [
      { path: "date", op: "eq", value: "$today" },
      { path: "sentCount", op: "gte", value: 1 },
      { path: "missing.path", op: "exists" },
      { path: "long", op: "eq", value: "short" },
    ], "2026-11-13");
    expect(result.ok).toBe(false);
    expect(result.note).toContain("date: expected 2026-11-13, got null");
    expect(result.note).toContain("sentCount: expected >= 1, got 0");
    expect(result.note).toContain("missing.path: expected present, got missing");
    expect(result.note).not.toContain("x".repeat(61));
    expect(result.note.length).toBeLessThanOrEqual(300);
  });
});

describe("probe scheduling and input", () => {
  const probe = { url: "https://example.com/api/health", expect: [{ path: "sentCount", op: "gte", value: 1 }] };
  it("selects the latest recent unpinged occurrence only", () => {
    const due = date("2026-11-13T12:35:00Z");
    expect(dueProbeOccurrence(schedule, zone, due - 86_400_000, null, due + 5 * 60_000)).toBe(due);
    expect(dueProbeOccurrence(schedule, zone, due - 86_400_000, due, due + 5 * 60_000)).toBeNull();
    expect(dueProbeOccurrence(schedule, zone, due - 86_400_000, null, due + 2 * 60 * 60_000 + 1)).toBeNull();
    expect(dueProbeOccurrence(schedule, zone, due + 1, null, due + 5 * 60_000)).toBeNull();
    expect(dueProbeOccurrence(schedule, zone, due - 86_400_000, null, date("2026-11-14T12:35:00Z"))).toBeNull();
  });
  it("validates schedules, zones, URLs and rules", () => {
    expect(validateOutcomeInput(schedule, zone, probe).probe?.expect).toHaveLength(1);
    expect(() => validateOutcomeInput("bad", zone, null)).toThrow("schedule");
    expect(() => validateOutcomeInput(schedule, "Bad/Zone", null)).toThrow("timeZone");
    expect(() => validateOutcomeInput(null, zone, probe)).toThrow("schedule required");
    for (const url of ["http://example.com/x", "https://127.0.0.1/x", "https://[::1]/x", "https://user@example.com/x", "https://example.com:444/x"]) expect(() => validateOutcomeInput(schedule, zone, { ...probe, url })).toThrow("probe.url");
    expect(() => validateOutcomeInput(schedule, zone, { ...probe, expect: Array(11).fill(probe.expect[0]) })).toThrow("1 to 10");
    expect(() => validateOutcomeInput(schedule, zone, { ...probe, expect: [{ path: "x", op: "gte", value: "1" }] })).toThrow("numeric");
    expect(() => validateOutcomeInput(schedule, zone, { ...probe, expect: [{ path: "a.*", op: "exists" }] })).toThrow("invalid rule");
  });
});

describe("outcome check safety and a daily email that sent to nobody", () => {
  it("refuses a schedule that never runs", () => {
    expect(() => validateOutcomeInput("0 0 30 2 *", "UTC", null)).toThrow(/never runs/);
  });
  it("fails a weekday with no send and passes a real one", () => {
    const rules = [{ path: "date", op: "eq" as const, value: "$today" }, { path: "sentCount", op: "gte" as const, value: 1 }];
    expect(judge({ date: null, sentCount: 0, lastSentAt: null }, rules, "2026-11-13")).toEqual({ ok: false, note: "date: expected 2026-11-13, got null; sentCount: expected >= 1, got 0" });
    expect(judge({ date: "2026-11-13", sentCount: 1 }, rules, "2026-11-13").ok).toBe(true);
    expect(judge({ date: "2026-11-12", sentCount: 3 }, rules, "2026-11-13").ok).toBe(false);
  });
  it("runs the 7:35 New York check once, at 12:35 UTC in winter", () => {
    const at = Date.parse("2026-11-13T12:37:00Z");
    expect(dueProbeOccurrence("35 7 * * 1-5", "America/New_York", Date.parse("2026-11-12T15:00:00Z"), null, at)).toBe(Date.parse("2026-11-13T12:35:00Z"));
    expect(dueProbeOccurrence("35 7 * * 1-5", "America/New_York", Date.parse("2026-11-12T15:00:00Z"), at, Date.parse("2026-11-13T12:42:00Z"))).toBeNull();
    expect(dueProbeOccurrence("35 7 * * 1-5", "America/New_York", Date.parse("2026-11-12T15:00:00Z"), null, Date.parse("2026-11-14T12:37:00Z"))).toBeNull();
  });
});
