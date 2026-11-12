import { describe, expect, it } from "vitest";
import { digestKey, renderDigest } from "./digest";

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
  it("uses one key per UTC day", () => {
    expect(digestKey(nowMs)).toBe("daily_digest:2026-11-12");
  });
});
