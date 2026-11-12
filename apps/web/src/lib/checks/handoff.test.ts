import { describe, expect, it } from "vitest";
import { cleanNote, handoffSummary, prLabel, queue, validPrUrl, type Attempt, type Finding } from "./handoff";
import { missingTable } from "./store";

const now = new Date("2026-11-10T12:00:00Z");
const finding = (id: string, firstOpenAt = new Date("2026-11-09T00:00:00Z")): Finding => ({ id, state: "open", dismissedAt: null, firstOpenAt });
const attempt = (id: string, hoursAgo: number, outcome: Attempt["outcome"] = null): Attempt => ({
  id: `${id}-${hoursAgo}`, checkId: id, takenAt: new Date(now.getTime() - hoursAgo * 3_600_000), outcome,
  prUrl: null, note: null, reportedAt: outcome ? new Date(now.getTime() - hoursAgo * 3_600_000 + 60_000) : null,
});

describe("handoff rules", () => {
  it("caps at three and counts abandoned attempts", () => {
    const f = finding("a");
    const attempts = [attempt("a", 3), attempt("a", 4), attempt("a", 5)];
    expect(queue([f], attempts, now).eligible).toEqual([]);
    expect(handoffSummary(f, attempts, now).capped).toBe(true);
  });
  it("expires unreported attempts after two hours", () => {
    expect(queue([finding("a")], [attempt("a", 1)], now).active?.checkId).toBe("a");
    expect(queue([finding("a")], [attempt("a", 2)], now).eligible).toHaveLength(1);
  });
  it("returns the active attempt before another finding", () => {
    const q = queue([finding("b"), finding("a")], [attempt("a", 1)], now);
    expect(q.active?.checkId).toBe("a");
    expect(q.counts.inProgress).toBe(1);
  });
  it("waits on a person for seven days and blocks not_a_problem", () => {
    const old = finding("a", new Date(now.getTime() - 300 * 3_600_000));
    expect(queue([old], [attempt("a", 1, "pr_opened")], now).counts.waitingOnPerson).toBe(1);
    expect(queue([old], [attempt("a", 169, "told_person")], now).eligible).toHaveLength(1);
    expect(queue([old], [attempt("a", 169, "not_a_problem")], now).eligible).toHaveLength(0);
  });
  it("starts a new count after a reopen", () => {
    const f = finding("a", new Date(now.getTime() - 30 * 60_000));
    expect(handoffSummary(f, [attempt("a", 20), attempt("a", 10), attempt("a", 5)], now).attempts).toBe(0);
    expect(queue([f], [attempt("a", 20, "not_a_problem")], now).eligible).toHaveLength(1);
  });
  it("counts direct person handoffs", () => {
    expect(queue([{ ...finding("a"), check: "previews_open" }], [], now).counts.needsPerson).toBe(1);
  });
});

describe("untrusted report input", () => {
  it("validates exact GitHub PR URL and linked repo", () => {
    expect(validPrUrl("https://github.com/Owner/Repo/pull/123", "owner/repo")).toBe(true);
    for (const url of ["http://github.com/o/r/pull/1", "https://evil.com/o/r/pull/1", "https://github.com/o/r/pull/1/files", "https://github.com/o/other/pull/1"]) {
      expect(validPrUrl(url, "o/r")).toBe(false);
    }
  });
  it("strips control characters and limits notes", () => {
    expect(cleanNote("a\n\u0000b\u0085c")).toBe("abc");
    expect(cleanNote("a".repeat(501))).toHaveLength(500);
  });
  it("recognizes either missing check table without masking unrelated errors", () => {
    expect(missingTable({ code: "42P01", message: 'relation "check_attempts" does not exist' }, "check_attempts")).toBe(true);
    expect(missingTable({ code: "42P01", message: 'relation "check_attempts" does not exist' }, "project_checks")).toBe(false);
    expect(missingTable({ message: 'relation "project_checks" does not exist' }, "project_checks")).toBe(true);
  });
  it("lets go of an attempt once its finding is fixed or dismissed", () => {
    const fixed: Finding = { ...finding("a"), state: "ok" };
    const q = queue([fixed, finding("b")], [attempt("a", 1)], now);
    expect(q.active).toBeUndefined();
    expect(q.eligible.map((f) => f.id)).toEqual(["b"]);
    const dismissed: Finding = { ...finding("a"), dismissedAt: now };
    expect(queue([dismissed, finding("b")], [attempt("a", 1)], now).active).toBeUndefined();
  });
  it("accepts only a real pull request address and labels it", () => {
    expect(validPrUrl("https://github.com/acme/site/pull/12", "Acme/Site")).toBe(true);
    for (const bad of ["https://github.com/-acme/site/pull/12", "https://github.com/acme/../pull/12", "https://github.com/acme/site/pull/12/files", "https://github.com/acme/site/pull/12?x=1",
      "https://github.com.evil.dev/acme/site/pull/12", "https://github.com@evil.dev/acme/site/pull/12", "https://github.com/acme/site/pull/1234567890", " https://github.com/acme/site/pull/12"])
      expect(validPrUrl(bad, null), bad).toBe(false);
    expect(prLabel("https://github.com/acme/site/pull/12")).toBe("acme/site#12");
    expect(prLabel("javascript:alert(1)")).toBeNull();
    expect(prLabel(null)).toBeNull();
  });
  it("removes invisible and direction-changing characters from a note", () => {
    expect(cleanNote("fixed\u202e gnp.exe\u200b\n ok ")).toBe("fixed gnp.exe ok");
    expect(cleanNote("\u200b\u200f")).toBeNull();
  });
});
