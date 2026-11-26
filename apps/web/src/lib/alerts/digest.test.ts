import { describe, expect, it } from "vitest";
import { digestKey, mergeNumbers, numbersSummary, renderDigest } from "./digest";

const nowMs = Date.parse("2026-11-12T14:01:00Z");
const base = { todayUrl: "https://spookyparticles.com/app/jobs", optOutUrl: "https://spookyparticles.com/api/alerts/opt-out?x", nowMs };
const job = (name: string, status: string, hoursAgo: number | null, project: string | null = null) =>
  ({ name, project, status, lastPingAt: hoursAgo === null ? null : new Date(nowMs - hoursAgo * 3_600_000).toISOString() }) as Parameters<typeof renderDigest>[0]["jobs"][number];

describe("daily digest", () => {
  it("says all fine, quietly, when nothing needs you", () => {
    const n = renderDigest({ ...base, jobs: [job("Nightly", "up", 2), job("Old", "retired", 900)], sent: {} })!;
    expect(n.subject).toBe("Spooky daily: all 1 job fine");
    expect(n.priority).toBe("low");
    expect(n.text).toContain("Last 24 h: no alerts.");
    expect(n.text).toContain("Turn this off: https://spookyparticles.com/api/alerts/opt-out?x");
  });
  it("lists what needs you first, with the project and when it was last heard", () => {
    const n = renderDigest({ ...base, jobs: [job("Build", "down", 26, "news-factory"), job("Feed", "never_checked_in", null), job("Ok", "up", 1)], sent: { job_quiet: 3, job_failed: 1, channel_test: 2 } })!;
    expect(n.subject).toBe("Spooky daily: 2 jobs need you");
    expect(n.priority).toBe("default");
    expect(n.text).toContain("- Build (news-factory): down, last heard 26 h ago");
    expect(n.text).toContain("- Feed: never checked in, never heard from");
    expect(n.text).toContain("Fine: 1 of 3 jobs.");
    expect(n.text).toContain("Last 24 h: 3 quiet jobs, 1 failed runs.");
  });
  it("sends nothing when there are no live jobs and no alerts", () => {
    expect(renderDigest({ ...base, jobs: [job("Old", "retired", 900)], sent: { channel_test: 1 } })).toBeNull();
  });
  it("says first and plainly when the morning has no numbers because reads were refused", () => {
    const input = { ...base, jobs: [job("Nightly", "up", 2)], sent: {}, numbers: { apps: [], uncounted: [] }, refused: 9 };
    const n = renderDigest(input)!;
    expect(n.text.split("\n")[0]).toBe("No numbers today: Vercel refused 9 Web Analytics reads, and no app sent its own.");
    expect(numbersSummary(input)).toEqual({ fresh: 0, expected: true });
  });
  it("says no numbers when only stale numbers are left", () => {
    const numbers = { apps: [{ app: "Old", day: "2026-11-01", mainName: "views", mainValue: 9, week: null, counts: {} }], uncounted: [] };
    expect(renderDigest({ ...base, jobs: [], sent: {}, numbers })!.text.split("\n")[0]).toBe("No numbers today: no app sent its own.");
  });
  it("does not expect numbers from a person with none set up", () => {
    expect(numbersSummary({ nowMs })).toEqual({ fresh: 0, expected: false });
    expect(renderDigest({ ...base, jobs: [job("Nightly", "up", 2)], sent: {} })!.text).not.toContain("No numbers");
  });
  it("uses one key per UTC day", () => {
    expect(digestKey(nowMs)).toBe("daily_digest:2026-11-12");
  });
  it("shows the largest fresh numbers, week totals, stale dates, and uncounted apps", () => {
    const numbers: NonNullable<Parameters<typeof renderDigest>[0]["numbers"]> = { apps: [
      { app: "Beta", day: "2026-11-11", mainName: "signups", mainValue: 1200, week: 4500, counts: { users: 340 } },
      { app: "Alpha", day: "2026-11-11", mainName: "sales", mainValue: 2000, week: null, counts: {} },
      { app: "Old", day: "2026-11-09", mainName: "views", mainValue: 9000, week: null, counts: {} },
    ], uncounted: ["Gamma", "Delta"] };
    const n = renderDigest({ ...base, jobs: [], sent: {}, numbers })!;
    expect(n.subject).toBe("Spooky daily: numbers");
    expect(n.text).toContain("Numbers for Wednesday (Pacific):\nTop: Alpha 2,000 sales, Beta 1,200 signups");
    expect(n.text).toContain("- Beta: signups 1,200 (week 4,500), users 340");
    expect(n.text).toContain("- Old: views 9,000  stale, last from Mon Nov 9");
    expect(n.text).toContain("- Not counted yet: Gamma, Delta");
    expect(n.text!.indexOf("Numbers for")).toBeLessThan(n.text!.indexOf("Last 24 h"));
  });
  it("labels Web Analytics rows as a UTC day, and an app's own number wins over them", () => {
    const sent = { apps: [{ app: "site-a", day: "2026-11-11", mainName: "product clicks", mainValue: 12, week: null, counts: {} }], uncounted: ["site-b", "Gamma"] };
    const web: Parameters<typeof mergeNumbers>[1] = [
      { app: "site-a", day: "2026-11-11", mainName: "visitors", mainValue: 99, week: null, counts: {}, utcDay: true },
      { app: "site-b", day: "2026-11-11", mainName: "visitors", mainValue: 17, week: 80, counts: { "page views": 35, events: 2 }, utcDay: true },
    ];
    const numbers = mergeNumbers(sent, web);
    expect(numbers.apps.map((a) => `${a.app}:${a.mainName}`)).toEqual(["site-a:product clicks", "site-b:visitors"]);
    expect(numbers.uncounted).toEqual(["Gamma"]);
    const n = renderDigest({ ...base, jobs: [], sent: {}, numbers })!;
    expect(n.text).toContain("- site-b: visitors 17 (week 80), events 2, page views 35 (UTC day)");
  });
});
