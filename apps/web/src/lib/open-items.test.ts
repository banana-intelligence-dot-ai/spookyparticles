import { describe, expect, it } from "vitest";
import type { Catch } from "./catches";
import { buildOpenItems, preventFor, type OpenInput } from "./open-items";

const now = Date.parse("2026-11-12T12:00:00Z");
const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const project = (name = "me/app", health: OpenInput["projects"][number]["health"] = "ok"): OpenInput["projects"][number] =>
  ({ id: name, name, kind: "repo", health, lastPushAt: at(60), stalePush: null });
const caught = (id: string, kind: Catch["kind"], extra: Partial<Catch> = {}): Catch => ({
  id, kind, project: "me/app", what: `${kind} broke`, caughtAt: at(60), alertedAt: null,
  heardAt: null, agent: null, fixedAt: null, fixedBy: null, status: "open", note: null,
  clearKey: id, ...extra,
});
const input = (extra: Partial<OpenInput> = {}): OpenInput => ({
  catches: [], claims: [], jobs: [], connections: [], projects: [project()], mutes: [],
  cleared: new Set(), agents: 1, windowDays: 30, now, ...extra,
});
const muted = (kind: "job" | "deploy" | null) => ({ key: `me/app|${kind ?? "*"}`, project: "me/app", kind, reason: null, at: at(1), by: null });

describe("buildOpenItems", () => {
  it("routes failed deploys by agent availability with handoff words", () => {
    const report = buildOpenItems(input({ catches: [caught("d1", "deploy", { cause: "Build failed" })] }));
    expect(report.withAgents[0]).toMatchObject({ kind: "deploy_failed", owner: "agents", who: "Sent to your agents. Nobody has picked it up yet." });
    expect(report.withAgents[0].prompt).toContain("Please fix the cause through a pull request");
    const withoutAgent = buildOpenItems(input({ agents: 0, catches: [caught("d1", "deploy")] }));
    expect(withoutAgent.withAgents).toEqual([]);
    expect(withoutAgent.onYou[0].who).toBe("No agent is connected, so this one is on you.");
  });

  it("keeps site, server error, and check notices on you", () => {
    const report = buildOpenItems(input({ catches: [caught("s", "site"), caught("e", "server_errors"), caught("c", "check")] }));
    expect(report.onYou.map((item) => item.kind)).toEqual(["site_down", "server_errors", "check"]);
    expect(report.withAgents).toEqual([]);
  });

  it("folds repeated deploy failures with every clear key", () => {
    const report = buildOpenItems(input({ catches: [caught("old", "deploy", { caughtAt: at(120) }), caught("new", "deploy", { caughtAt: at(30) })] }));
    expect(report.withAgents).toHaveLength(1);
    expect(report.withAgents[0]).toMatchObject({ count: 2, since: at(120) });
    expect(report.withAgents[0].clearKeys).toEqual(["old", "new"]);
  });

  it("folds several check suggestions into one project row", () => {
    const report = buildOpenItems(input({ catches: [caught("a", "check"), caught("b", "check"), caught("c", "check")] }));
    expect(report.onYou[0]).toMatchObject({ title: "3 check suggestions", count: 3, clearKeys: ["a", "b", "c"] });
  });

  it("shows a waiting catch with agents and no action yet", () => {
    const report = buildOpenItems(input({ catches: [caught("w", "job", { status: "waiting", note: "Next run due" })] }));
    expect(report.withAgents[0]).toMatchObject({ waiting: true, who: "Waiting on its next run.", todo: "Nothing to do yet. Its next run decides." });
  });

  it("shows a never checked in job unless cleared or muted", () => {
    const jobs: OpenInput["jobs"] = [{ id: "j1", name: "Backup", project: "me/app", status: "never_checked_in", lastPingAt: null, lastNote: null, nextDueAt: null }];
    expect(buildOpenItems(input({ jobs })).withAgents[0]).toMatchObject({ kind: "job_never", clearKeys: ["never:j1"] });
    expect(buildOpenItems(input({ jobs, cleared: new Set(["never:j1"]) })).summary.open).toBe(0);
    expect(buildOpenItems(input({ jobs, mutes: [muted("job")] })).summary.open).toBe(0);
  });

  it("shows a stale push on you unless cleared or muted for deploys", () => {
    const stalePush = { pushedAt: at(60), lastDeployAt: at(120), host: "Vercel" };
    const projects = [{ ...project(), stalePush }];
    const key = `stale:me/app@${stalePush.pushedAt}`;
    expect(buildOpenItems(input({ projects })).onYou[0]).toMatchObject({ kind: "stale_push", clearKeys: [key] });
    expect(buildOpenItems(input({ projects, cleared: new Set([key]) })).summary.open).toBe(0);
    expect(buildOpenItems(input({ projects, mutes: [muted("deploy")] })).summary.open).toBe(0);
  });

  it("shows an errored connection without clear keys", () => {
    const report = buildOpenItems(input({ connections: [{ id: "c1", provider: "vercel", display: "My Vercel", status: "errored", statusReason: "Expired" }] }));
    expect(report.onYou[0]).toMatchObject({ kind: "connection", clearKeys: [], owner: "you" });
  });

  it("orders site down before failed deploy before check", () => {
    const report = buildOpenItems(input({ agents: 0, catches: [caught("c", "check"), caught("d", "deploy"), caught("s", "site")] }));
    expect(report.onYou.map((item) => item.kind)).toEqual(["site_down", "deploy_failed", "check"]);
  });

  it("reports the newest five fixes, checks included as History counts them, and watched project totals", () => {
    const fixes = Array.from({ length: 6 }, (_, i) => caught(`f${i}`, "deploy", {
      status: "fixed", caughtAt: at((i + 1) * 60 + 30), fixedAt: at((i + 1) * 60), heardAt: i < 2 ? at((i + 1) * 60 + 20) : null,
    }));
    const report = buildOpenItems(input({ catches: [...fixes, caught("check", "check", { status: "fixed", fixedAt: at(1) })], projects: [project(), project("me/archived", "archived"), project("me/muted")], mutes: [{ ...muted(null), key: "me/muted|*", project: "me/muted" }] }));
    expect(report.recentFixes.map((fix) => fix.id)).toEqual(["check", "f0", "f1", "f2", "f3"]);
    expect(report.summary).toMatchObject({ fixed: 7, fixedByAgents: 2, watching: 1, notWatched: 1 });
  });
});

describe("preventFor", () => {
  it("offers to stop watching archived and long idle projects", () => {
    expect(preventFor("me/app", "deploy", [project("me/app", "archived")], now)).toMatchObject({ kind: null, ask: expect.stringContaining("archived") });
    expect(preventFor("me/app", "deploy", [{ ...project(), lastPushAt: at(195 * 24 * 60) }], now)).toMatchObject({ kind: null, ask: expect.stringContaining("195 days") });
  });

  it("offers the catch kind on an active project", () => {
    expect(preventFor("me/app", "site", [project()], now)).toMatchObject({ kind: "site", project: "me/app" });
  });
});
