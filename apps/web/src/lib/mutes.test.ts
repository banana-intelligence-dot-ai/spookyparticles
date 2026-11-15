import { describe, expect, it } from "vitest";
import { buildCatches, type CatchInput } from "./catches";
import { MUTED, UNMUTED, muteFor, muteInput, muteKey, muteKindOfAlert, mutesFrom } from "./mutes";

const at = (m: number) => new Date(Date.UTC(2026, 10, 12, 12, m));
const ev = (name: string, project: string, kind: string | null, m: number) => ({ name, properties: { key: muteKey(project, kind as never), project, kind }, createdAt: at(m) });

describe("mutesFrom", () => {
  it("keeps a mute until a later unmute, newest first", () => {
    const rows = [ev(MUTED, "n8peace/OneAlarm", null, 1), ev(MUTED, "n8peace/blog", "site", 2), ev(UNMUTED, "n8peace/blog", "site", 3), ev(MUTED, "n8peace/test", null, 4)];
    expect(mutesFrom(rows).map((m) => m.project)).toEqual(["n8peace/test", "n8peace/OneAlarm"]);
  });
});

describe("muteFor", () => {
  const mutes = mutesFrom([ev(MUTED, "n8peace/OneAlarm", null, 1), ev(MUTED, "n8peace/blog", "site", 2)]);
  it("a whole-project mute covers every kind and both spellings of the name", () => {
    expect(muteFor(mutes, "OneAlarm", "deploy")?.project).toBe("n8peace/OneAlarm");
    expect(muteFor(mutes, "n8peace/onealarm", null)).not.toBeNull();
  });
  it("a kind mute covers that kind only", () => {
    expect(muteFor(mutes, "n8peace/blog", "site")).not.toBeNull();
    expect(muteFor(mutes, "n8peace/blog", "deploy")).toBeNull();
    expect(muteFor(mutes, null, "site")).toBeNull();
  });
  it("maps stored alert kinds to mute kinds", () => {
    expect(["deploy_failed", "job_quiet", "site_down", "server_errors_recovered", "expiration"].map(muteKindOfAlert)).toEqual(["deploy", "job", "site", "server_errors", null]);
  });
});

describe("muteInput", () => {
  it("needs a project and a known kind", () => {
    expect(muteInput({ project: " a/b ", kind: "all", reason: "ended" })).toEqual({ project: "a/b", kind: null, reason: "ended" });
    expect(() => muteInput({ kind: "site" })).toThrow();
    expect(() => muteInput({ project: "a/b", kind: "everything" })).toThrow();
  });
});

describe("buildCatches with mutes and clears", () => {
  const NOW = new Date("2026-11-12T12:00:00Z");
  const base = (over: Partial<CatchInput>): CatchInput => ({ alerts: [], events: [], checks: [], attempts: [], keyNames: new Map(), ...over });
  const alerts = [
    { kind: "site_down", key: "site:p1:x:down", payload: { project: "n8peace/test" }, createdAt: new Date("2026-11-12T08:00:00Z"), sentAt: null },
    { kind: "site_down", key: "site:p2:x:down", payload: { project: "n8peace/blog" }, createdAt: new Date("2026-11-12T09:00:00Z"), sentAt: null },
    { kind: "site_down", key: "site:p3:x:down", payload: { project: "n8peace/shop" }, createdAt: new Date("2026-11-12T10:00:00Z"), sentAt: null },
  ];
  it("closes open notices on muted projects and cleared notices, and counts them as closed", () => {
    const r = buildCatches(base({ alerts, ignored: new Set(["site:p3:x:down"]), mutes: mutesFrom([ev(MUTED, "test", null, 1)]) }), NOW);
    const by = Object.fromEntries(r.catches.map((c) => [c.project, [c.status, c.note]]));
    expect(by["n8peace/test"]).toEqual(["ignored", "You stopped watching this project."]);
    expect(by["n8peace/shop"]).toEqual(["ignored", "You cleared this notice."]);
    expect(by["n8peace/blog"]).toEqual(["open", null]);
    expect(r.summary).toMatchObject({ open: 1, closed: 2 });
  });
});
