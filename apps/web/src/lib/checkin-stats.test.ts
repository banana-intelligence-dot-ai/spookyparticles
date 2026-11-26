import { describe, expect, it } from "vitest";
import { pacificDay, parseStats } from "./checkin-stats";

const now = Date.parse("2026-03-09T06:30:00Z");

describe("Pacific stat days", () => {
  it("uses the Pacific calendar across midnight and daylight saving time", () => {
    expect(pacificDay(now)).toBe("2026-03-08");
    expect(pacificDay(now, -1)).toBe("2026-03-07");
    expect(pacificDay(Date.parse("2026-03-09T07:30:00Z"))).toBe("2026-03-09");
  });
});

describe("parseStats", () => {
  it("defaults to yesterday and accepts bounded whole numbers", () => {
    expect(parseStats({ main: { name: "signups", value: 12 }, counts: { users: 340 } }, now)).toEqual({ ok: true, value: { day: "2026-03-07", mainName: "signups", mainValue: 12, mainWeek: null, counts: { users: 340 } } });
    expect(parseStats({ day: "2026-03-08", main: { name: "new_users", value: 2_000_000_000, week: 0 } }, now)).toMatchObject({ ok: true, value: { mainWeek: 0, counts: {} } });
  });
  it("rejects extra fields, text, invalid numbers, and too many counts", () => {
    const main = { name: "signups", value: 12 };
    for (const raw of [
      { main, note: "text" },
      { main: { ...main, note: "text" } },
      { main: { name: "Signups", value: 12 } },
      { main: { name: "signups", value: 1.5 } },
      { main: { name: "signups", value: -1 } },
      { main: { name: "signups", value: 2_000_000_001 } },
      { main: { ...main, week: "12" } },
      { main, counts: { a: 1, b: 2, c: 3, d: 4 } },
      { main, counts: { users: "many" } },
    ]) expect(parseStats(raw, now).ok).toBe(false);
  });
  it("rejects unreal, future, and old days", () => {
    const main = { name: "signups", value: 1 };
    for (const day of ["2026-02-30", "2026-03-09", "2026-02-04", "2026-3-8"]) {
      expect(parseStats({ day, main }, now).ok).toBe(false);
    }
    expect(parseStats({ day: "2026-02-05", main }, now).ok).toBe(true);
  });
});
