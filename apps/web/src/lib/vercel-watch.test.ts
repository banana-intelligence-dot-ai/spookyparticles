import { describe, expect, it } from "vitest";
import { historyChoice, scheduleConnectionId, scheduleSyncStatus } from "./vercel-watch";

const refused = { ok: false as const, reason: "not_readable" as const, status: 403 };
const unavailable = { ok: false as const, reason: "unavailable" as const };
const ok = { ok: true as const, evidence: [] };
const candidate = (id: string, installed = false, status = "active", token: string | null = "sealed") => ({
  id, status, encryptedAccessToken: token, scopes: installed ? ["vercel-install:{}"] : ["projects:read"],
});

describe("request history connection choice", () => {
  const connections = [candidate("install", true), candidate("revoked", false, "revoked"), candidate("pasted"), candidate("empty", false, "active", null)];

  it("tries current, then pasted tokens, then installs, and stops on first success", () => {
    expect(historyChoice("current", connections, [])).toEqual({ kind: "try", id: "current" });
    expect(historyChoice("current", connections, [{ id: "current", result: refused }])).toEqual({ kind: "try", id: "pasted" });
    expect(historyChoice("current", connections, [{ id: "current", result: refused }, { id: "pasted", result: refused }])).toEqual({ kind: "try", id: "install" });
    expect(historyChoice("current", connections, [{ id: "current", result: refused }, { id: "pasted", result: ok }])).toEqual({ kind: "ok", id: "pasted" });
  });

  it("returns not readable after every candidate refuses", () => {
    expect(historyChoice("current", connections, [{ id: "current", result: refused }, { id: "pasted", result: refused }, { id: "install", result: refused }])).toEqual({ kind: "not_readable" });
  });

  it("does not try alternatives after a transient failure", () => {
    expect(historyChoice("current", connections, [{ id: "current", result: unavailable }])).toEqual({ kind: "unavailable" });
  });

  it("limits fallback attempts to three", () => {
    const many = [candidate("a"), candidate("b"), candidate("c"), candidate("d")];
    expect(historyChoice("current", many, ["current", "a", "b", "c"].map((id) => ({ id, result: refused })))).toEqual({ kind: "not_readable" });
  });
});

describe("schedule connection during sync", () => {
  const active = new Set(["chosen", "syncing"]);
  it("keeps a working active connection", () => {
    expect(scheduleConnectionId({ vercelConnectionId: "chosen", evidenceState: "ok" }, active, "syncing")).toBe("chosen");
  });
  it("replaces inactive or unproven connections", () => {
    expect(scheduleConnectionId({ vercelConnectionId: "gone", evidenceState: "ok" }, active, "syncing")).toBe("syncing");
    expect(scheduleConnectionId({ vercelConnectionId: "chosen", evidenceState: "not_readable" }, active, "syncing")).toBe("syncing");
    expect(scheduleConnectionId(undefined, active, "syncing")).toBe("syncing");
  });
});

describe("schedule state during sync", () => {
  it("does not revive a retired schedule when its definition or deployment changes", () => {
    expect(scheduleSyncStatus("retired", false, true)).toBe("retired");
    expect(scheduleSyncStatus("retired", true, true)).toBe("retired");
  });

  it("continues the existing automatic pause and restart behavior", () => {
    expect(scheduleSyncStatus("up", true, false)).toBe("paused");
    expect(scheduleSyncStatus("down", false, true)).toBe("up");
    expect(scheduleSyncStatus("late", false, false)).toBe("late");
  });
});

describe("a schedule whose history cannot be read", () => {
  it("waits silently unless its owner checked in after the last good read", async () => {
    const { mustWaitForCheckIn } = await import("./vercel-watch");
    const read = new Date("2026-11-10T20:35:10Z");
    // Never heard from at all.
    expect(mustWaitForCheckIn({ lastPingAt: null, lastEvidenceCheckedAt: read })).toBe(true);
    // The last ping was evidence we read ourselves, before the last good read.
    expect(mustWaitForCheckIn({ lastPingAt: new Date("2026-11-10T20:30:00Z"), lastEvidenceCheckedAt: read })).toBe(true);
    // History was never readable.
    expect(mustWaitForCheckIn({ lastPingAt: new Date("2026-11-10T20:30:00Z"), lastEvidenceCheckedAt: null })).toBe(true);
    // The owner added a check-in line and it has run since.
    expect(mustWaitForCheckIn({ lastPingAt: new Date("2026-11-10T21:00:00Z"), lastEvidenceCheckedAt: read })).toBe(false);
  });
});
