import { describe, expect, it } from "vitest";
import { ago, cleanMinutes, cleanName, jobDisplayStatus, jobIssue, parseStatusFilter, sortJobViews, classifyPing, pingDueAt, isHungRun, shouldRealert, dueState, firstCheckInWindowMs } from "./checkins";
import { matchesProject, validateTarget } from "./alerts/channels";

describe("project alert routing", () => {
  it("matches trimmed names and owner/name forms without matching unrelated projects", () => {
    expect(matchesProject(" N8PEACE/Daystart ", "daystart")).toBe(true);
    expect(matchesProject("artifactnews", "n8peace/ARTIFACTNEWS")).toBe(true);
    expect(matchesProject("n8peace/daystart", "other/daystart")).toBe(false);
    expect(matchesProject("daystart", undefined)).toBe(false);
  });
});

describe("run decisions", () => {
  it("fails only measured ok runs below the minimum", () => {
    expect(classifyPing("ok", 0, 1, "done")).toEqual({ kind: "fail", note: "done ran but did nothing: count 0, expected at least 1" });
    expect(classifyPing("ok", null, 1, null)).toEqual({ kind: "ok", note: null });
    expect(classifyPing("ok", 1, 1, null)).toEqual({ kind: "ok", note: null });
    expect(classifyPing("start", 0, 1, null)).toEqual({ kind: "start", note: null });
  });
  it("uses max run time and skips grace for a started run", () => {
    expect(pingDueAt("start", 60, 10, 1000)).toBe(601000);
    expect(pingDueAt("ok", 60, 10, 1000)).toBe(3601000);
    expect(isHungRun("start", 10)).toBe(true);
    expect(isHungRun("ok", 10)).toBe(false);
    expect(isHungRun("start", null)).toBe(false);
  });
});

describe("repeat alert back-off", () => {
  const alerts = (period: number, misses: number) => Array.from({ length: misses }, (_, i) => i + 1).filter((n) => shouldRealert(n, period));
  it("sends a 5-minute job 4 alerts on day one, not 288", () => {
    expect(alerts(5, 288)).toEqual([1, 13, 49, 289].filter((n) => n <= 288));
    expect(alerts(5, 289)).toEqual([1, 13, 49, 289]);
  });
  it("keeps a daily job alerting once a day", () => {
    expect(alerts(1440, 4)).toEqual([1, 2, 3, 4]);
  });
  it("an hourly job alerts at 1, 4 and 24 hours, then daily", () => {
    expect(alerts(60, 50)).toEqual([1, 2, 5, 25, 49]);
  });
});

describe("check-in input cleaning", () => {
  it("accepts a sane name and period, rejects junk", () => {
    expect(cleanName("  My Happenings  update ")).toBe("My Happenings update");
    expect(cleanName("x")).toBeNull();
    expect(cleanMinutes(1440, null)).toBe(1440);
    expect(cleanMinutes("60", null)).toBe(60);
    expect(cleanMinutes(0, null)).toBeNull();
    expect(cleanMinutes(1.5, null)).toBeNull();
    expect(cleanMinutes(undefined, 10)).toBe(10);
    expect(cleanMinutes(10 ** 9, null)).toBeNull();
  });
  it("says how long ago in plain units", () => {
    expect(ago(20_000)).toBe("under a minute");
    expect(ago(5 * 60_000)).toBe("5 min");
    expect(ago(90 * 60_000)).toBe("1.5 h");
    expect(ago(3 * 24 * 3_600_000)).toBe("3 d");
  });
});

describe("check-in state", () => {
  const createdAt = new Date("2026-11-09T12:00:00Z");

  it("flags a new job only after 24 hours without a check-in", () => {
    const job = { status: "new" as const, lastPingAt: null, createdAt };
    expect(jobDisplayStatus(job, createdAt.getTime() + 24 * 60 * 60_000 - 1)).toBe("new");
    expect(jobDisplayStatus(job, createdAt.getTime() + 24 * 60 * 60_000)).toBe("never_checked_in");
    expect(jobDisplayStatus({ ...job, lastPingAt: new Date("2026-11-10T11:00:00Z") }, createdAt.getTime() + 48 * 60 * 60_000)).toBe("new");
  });

  it("gives a slow job until its first run is due before calling it never checked in", () => {
    const weekly = { status: "new" as const, lastPingAt: null, createdAt, periodMinutes: 7 * 24 * 60, graceMinutes: 120 };
    expect(jobDisplayStatus(weekly, createdAt.getTime() + 3 * 24 * 60 * 60_000)).toBe("new");
    expect(jobDisplayStatus(weekly, createdAt.getTime() + (7 * 24 * 60 + 120) * 60_000)).toBe("never_checked_in");
  });

  it("reads a status filter, with issues as a shorthand, and refuses unknown words", () => {
    expect([...parseStatusFilter("down,late")!]).toEqual(["down", "late"]);
    expect([...parseStatusFilter("issues")!].sort()).toEqual(["down", "late", "never_checked_in"]);
    expect(parseStatusFilter("down,broken")).toBeNull();
    expect(parseStatusFilter(null)).toBeNull();
  });

  it("keeps retired jobs retired and puts them at the bottom", () => {
    expect(jobDisplayStatus({ status: "retired", lastPingAt: null, createdAt }, createdAt.getTime() + 48 * 60 * 60_000)).toBe("retired");
    const jobs = [
      { name: "Beta", status: "retired" as const },
      { name: "Zulu", status: "up" as const },
      { name: "Alpha", status: "retired" as const },
      { name: "Able", status: "new" as const },
    ];
    expect(sortJobViews(jobs).map((job) => job.name)).toEqual(["Able", "Zulu", "Alpha", "Beta"]);
  });

  it("reports never-checked-in jobs to agents without treating retired jobs as broken", () => {
    expect(jobIssue({ status: "never_checked_in", lastPingKind: null })).toBe("never_checked_in");
    expect(jobIssue({ status: "down", lastPingKind: "fail" })).toBe("failed");
    expect(jobIssue({ status: "late", lastPingKind: "ok" })).toBe("quiet");
    expect(jobIssue({ status: "retired", lastPingKind: "fail" })).toBeNull();
  });
});

describe("manual wall-clock schedules", () => {
  const fridayPing = Date.parse("2026-11-13T12:40:00Z");
  const mondayDue = Date.parse("2026-11-16T12:35:00Z");
  it("waits through Saturday and Sunday, then applies grace on Monday", () => {
    const due = pingDueAt("ok", 1440, null, fridayPing, "35 7 * * 1-5", "America/New_York");
    expect(due).toBe(mondayDue);
    expect(dueState(due, 10, Date.parse("2026-11-14T18:00:00Z"))).toBe("on_time");
    expect(dueState(due, 10, Date.parse("2026-11-15T18:00:00Z"))).toBe("on_time");
    expect(dueState(due, 10, mondayDue + 5 * 60_000)).toBe("late");
    expect(dueState(due, 10, mondayDue + 10 * 60_000)).toBe("quiet");
  });
  it("does not call a new Friday job late over the weekend", () => {
    const createdAt = new Date("2026-11-13T13:00:00Z");
    const job = { source: "manual", schedule: "35 7 * * 1-5", timeZone: "America/New_York", status: "new" as const, lastPingAt: null, createdAt, graceMinutes: 10 };
    expect(firstCheckInWindowMs(job)).toBe(mondayDue - createdAt.getTime() + 10 * 60_000);
    expect(jobDisplayStatus(job, Date.parse("2026-11-15T18:00:00Z"))).toBe("new");
    expect(jobDisplayStatus(job, mondayDue + 10 * 60_000)).toBe("never_checked_in");
  });
});

describe("alert channel targets", () => {
  it("turns an ntfy topic into a topic URL and masks it", () => {
    const r = validateTarget("ntfy", "example-topic-k3v9q2x7");
    expect(r).toMatchObject({ ok: true, target: "https://ntfy.sh/example-topic-k3v9q2x7" });
    expect((r as { label: string }).label).toBe("ntfy.sh/exa…");
    expect(validateTarget("ntfy", "https://ntfy.example.com/example-topic-k3v9q2x7")).toMatchObject({ ok: true, target: "https://ntfy.example.com/example-topic-k3v9q2x7" });
    expect(validateTarget("ntfy", "http://ntfy.sh/x").ok).toBe(false);
  });
  it("accepts only real Slack and Teams webhook hosts", () => {
    expect(validateTarget("slack", "https://hooks.slack.com/services/T000/B000/XXXX").ok).toBe(true);
    expect(validateTarget("slack", "https://evil.example/hooks.slack.com/services/x").ok).toBe(false);
    expect(validateTarget("teams", "https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?x=1").ok).toBe(true);
    expect(validateTarget("teams", "https://contoso.webhook.office.com/webhookb2/abc").ok).toBe(true);
    expect(validateTarget("teams", "https://example.com/hook").ok).toBe(false);
  });
  it("masks email and rejects non-addresses", () => {
    expect(validateTarget("email", "Nate@Example.com")).toMatchObject({ ok: true, target: "nate@example.com", label: "na…@example.com" });
    expect(validateTarget("email", "not an email").ok).toBe(false);
  });
});

describe("scheduled jobs that report early", () => {
  it("counts a ping a minute early toward that run, so the next due time is the next weekday", () => {
    const early = Date.parse("2026-11-13T12:34:00Z"); // Friday 7:34 New York
    expect(pingDueAt("ok", 1440, null, early, "35 7 * * 1-5", "America/New_York", "manual")).toBe(Date.parse("2026-11-16T12:35:00Z"));
  });
});
