import { describe, expect, it } from "vitest";
import { ago, cleanMinutes, cleanName, jobDisplayStatus, jobIssue, sortJobViews } from "./checkins";
import { validateTarget } from "./alerts/channels";

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
