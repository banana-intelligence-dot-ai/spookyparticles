import { describe, expect, it } from "vitest";
import type { Catch } from "./catches";
import { buildFeed, FEED_OFF, FEED_ON, inFeed, publicFixes } from "./public-fixes";

const base: Catch = {
  id: "c1",
  clearKey: "c1",
  kind: "deploy",
  project: "secret-app",
  what: "Build failed in secret-app: TypeError at src/pay.ts",
  caughtAt: "2026-11-14T10:00:00.000Z",
  alertedAt: null,
  heardAt: "2026-11-14T10:01:00.000Z",
  agent: "Claude Code on nate-mac",
  fixedAt: "2026-11-14T10:09:48.000Z",
  fixedBy: { kind: "commit", sha: "abc1234", message: "fix pay flow" },
  status: "fixed",
  note: null,
  cause: "TypeError at src/pay.ts",
};

describe("publicFixes", () => {
  it("keeps only a time, a kind and minutes", () => {
    const [row] = publicFixes([base]);
    expect(row).toEqual({ at: "2026-11-14T10:09:00.000Z", what: "Deploy failed", minutes: 10 });
    const text = JSON.stringify(publicFixes([base]));
    for (const leak of ["secret", "pay", "abc1234", "nate", "Claude", "TypeError"]) expect(text).not.toContain(leak);
  });

  it("skips fixes nobody was alerted about, and anything not fixed", () => {
    const human = { ...base, heardAt: null, alertedAt: null, confirmedAt: null };
    const open = { ...base, status: "open" as const, fixedAt: null };
    expect(publicFixes([human, open])).toEqual([]);
  });

  it("counts a job that came back after an alert went out", () => {
    const job = { ...base, kind: "job" as const, fixedBy: null, heardAt: null, alertedAt: "2026-11-14T10:02:00.000Z" };
    expect(publicFixes([job])).toEqual([{ at: "2026-11-14T10:09:00.000Z", what: "Scheduled job went quiet", minutes: 10 }]);
  });

  it("shows one commit that fixed two projects as one fix", () => {
    expect(publicFixes([base, { ...base, id: "c2", project: "secret-app-twin" }])).toHaveLength(1);
  });

  it("counts a PR fix as an agent's", () => {
    expect(publicFixes([{ ...base, heardAt: null, alertedAt: null, fixedBy: { kind: "pr", url: "https://github.com/x/y/pull/1" } }])).toHaveLength(1);
  });
});

describe("buildFeed", () => {
  it("merges accounts newest first with a median", () => {
    const feed = buildFeed(
      [
        [{ at: "2026-11-14T10:00:00.000Z", what: "a", minutes: 10 }],
        [{ at: "2026-11-14T12:00:00.000Z", what: "b", minutes: 4 }, { at: "2026-11-13T12:00:00.000Z", what: "c", minutes: 30 }],
      ],
      new Date("2026-11-15T00:00:00.000Z"),
    );
    expect(feed.fixed).toBe(3);
    expect(feed.medianMinutes).toBe(10);
    expect(feed.fixes.map((f) => f.what)).toEqual(["b", "a", "c"]);
  });

  it("is empty and honest with no rows", () => {
    const feed = buildFeed([], new Date("2026-11-15T00:00:00.000Z"));
    expect(feed).toMatchObject({ fixed: 0, medianMinutes: null, fixes: [] });
  });
});

describe("inFeed", () => {
  const before = new Date("2026-11-10T00:00:00.000Z");
  const after = new Date("2026-11-16T00:00:00.000Z");

  it("uses each account's latest choice", () => {
    const users = [{ id: "a", createdAt: before }, { id: "b", createdAt: after }];
    const rows = [
      { userId: "a", name: FEED_ON },
      { userId: "b", name: FEED_ON },
      { userId: "b", name: FEED_OFF },
      { userId: null, name: FEED_ON },
    ];
    expect(inFeed(users, rows)).toEqual(["a"]);
  });

  it("starts new accounts on and older accounts off", () => {
    expect(inFeed([{ id: "old", createdAt: before }, { id: "new", createdAt: after }], [])).toEqual(["new"]);
  });
});
