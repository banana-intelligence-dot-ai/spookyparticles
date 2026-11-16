import { describe, expect, it } from "vitest";
import type { Attempt, Finding } from "./handoff";
import { grantedMerges, MERGE_ALLOWED, MERGE_DECLINED, MERGE_WITHDRAWN, mergeRules, mergeState, type MergeEvent } from "./merge";

const now = new Date("2026-11-16T20:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
const PR = "https://github.com/me/app/pull/7";
const finding = (extra: Partial<Finding> = {}): Finding & { project: string } =>
  ({ id: "f1", state: "open", dismissedAt: null, firstOpenAt: ago(48), check: "deps_not_updated", project: "me/app", ...extra });
const opened = (extra: Partial<Attempt> = {}): Attempt =>
  ({ id: "a1", checkId: "f1", takenAt: ago(5), outcome: "pr_opened", prUrl: PR, note: null, reportedAt: ago(4), ...extra });
const event = (name: string, h: number, extra: Record<string, unknown> = {}): MergeEvent => ({ name, properties: { checkId: "f1", prUrl: PR, ...extra }, createdAt: ago(h) });

describe("mergeState", () => {
  it("offers the button on a low-risk finding with its pull request waiting", () => {
    expect(mergeState(finding(), [opened()], [], now)).toEqual({ canAllow: true, allowed: false, declined: null, prUrl: PR });
  });
  it("is not offered for other checks, fixed findings, other outcomes, or an old pull request", () => {
    expect(mergeState(finding({ check: "cron_unguarded" }), [opened()], [], now)).toBeNull();
    expect(mergeState(finding({ check: "secret_in_public_code" }), [opened()], [], now)).toBeNull();
    expect(mergeState(finding({ state: "ok" }), [opened()], [], now)).toBeNull();
    expect(mergeState(finding({ dismissedAt: ago(1) }), [opened()], [], now)).toBeNull();
    expect(mergeState(finding(), [opened({ outcome: "told_person", prUrl: null })], [], now)).toBeNull();
    expect(mergeState(finding(), [opened({ reportedAt: ago(24 * 8), takenAt: ago(24 * 8) })], [], now)).toBeNull();
  });
  it("follows the newest event for that pull request", () => {
    expect(mergeState(finding(), [opened()], [event(MERGE_ALLOWED, 2)], now)?.allowed).toBe(true);
    expect(mergeState(finding(), [opened()], [event(MERGE_ALLOWED, 2), event(MERGE_WITHDRAWN, 1)], now)?.allowed).toBe(false);
    expect(mergeState(finding(), [opened()], [event(MERGE_ALLOWED, 2), event(MERGE_DECLINED, 1, { note: "A check failed" })], now)).toMatchObject({ allowed: false, declined: "A check failed" });
  });
  it("ignores a yes given for an earlier pull request", () => {
    expect(mergeState(finding(), [opened()], [event(MERGE_ALLOWED, 2, { prUrl: "https://github.com/me/app/pull/6" })], now)?.allowed).toBe(false);
  });
});

describe("grantedMerges", () => {
  it("hands the agent only allowed merges, with rules that name the files", () => {
    const merges = grantedMerges([finding()], [opened()], [event(MERGE_ALLOWED, 1)], now);
    expect(merges).toEqual([{ findingId: "f1", project: "me/app", prUrl: PR, rules: mergeRules([".github/dependabot.yml", ".github/dependabot.yaml"]) }]);
    expect(merges[0].rules.join(" ")).toMatch(/gh pr checks/);
    expect(merges[0].rules.join(" ")).toMatch(/decline_merge/);
    expect(grantedMerges([finding()], [opened()], [], now)).toEqual([]);
  });
});
