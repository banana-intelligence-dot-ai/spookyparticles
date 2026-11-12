import { describe, expect, it } from "vitest";
import { handoffWords } from "./check-view";

const now = Date.parse("2026-11-10T12:00:00Z");
const base = { attempts: 1, max: 3, capped: false, inProgress: false, last: null };
const last = (outcome: string, extra: { prUrl?: string | null; note?: string | null } = {}) => ({ ...base, last: { outcome, prUrl: extra.prUrl ?? null, note: extra.note ?? null, at: "2026-11-10T10:00:00Z" } });

describe("the agent line on a finding", () => {
  it("says nothing when no agent has touched the finding", () => {
    expect(handoffWords(undefined, now)).toBeNull();
    expect(handoffWords({ ...base, attempts: 0 }, now)).toBeNull();
  });
  it("puts work in progress and a used-up cap before any older report", () => {
    expect(handoffWords({ ...last("could_not_fix"), inProgress: true }, now)?.text).toBe("Your agent is working on this.");
    expect(handoffWords({ ...last("could_not_fix"), attempts: 3, capped: true }, now)?.text).toBe("Three tries used. This one needs you.");
  });
  it("links a pull request only when the address is a real one", () => {
    expect(handoffWords(last("pr_opened", { prUrl: "https://github.com/acme/site/pull/12" }), now)?.pr).toEqual({ href: "https://github.com/acme/site/pull/12", label: "acme/site#12" });
    expect(handoffWords(last("pr_opened", { prUrl: "https://evil.dev/acme/site/pull/12" }), now)).toBeNull();
    expect(handoffWords(last("pr_opened", { prUrl: "javascript:alert(1)" }), now)).toBeNull();
  });
  it("carries the agent's note as text and leaves the decision with the person", () => {
    expect(handoffWords(last("not_a_problem", { note: "Preview only." }), now)).toEqual({ text: "Your agent thinks this is not a problem.", note: "Preview only." });
    expect(handoffWords(last("could_not_fix"), now)).toEqual({ text: "Your agent could not fix this.", note: undefined });
    expect(handoffWords(last("told_person"), now)?.text).toMatch(/^Your agent passed this to you .+\.$/);
  });
});
