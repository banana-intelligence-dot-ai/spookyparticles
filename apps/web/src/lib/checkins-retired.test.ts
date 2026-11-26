import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { recordPing, updateJob } from "./checkins";

vi.mock("@/db", async (original) => ({ ...await original(), getDb: vi.fn() }));
vi.mock("./pager", () => ({ pagerEnabled: vi.fn(), pageGithub: vi.fn() }));
vi.mock("./alerts/channels", () => ({ matchesProject: (a: string, b: string) => a === b, deliverToAll: vi.fn() }));
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn() }));
vi.mock("@/lib/analytics/server", () => ({ track: vi.fn() }));
vi.mock("@/lib/env", () => ({ appUrl: () => "https://spooky.example" }));
vi.mock("./claims", () => ({ claimsFor: vi.fn().mockResolvedValue([]), claimFor: vi.fn().mockReturnValue(null) }));
vi.mock("./agent-first", () => ({ shouldDeferToAgent: vi.fn().mockResolvedValue(false) }));

const MIN = 60_000;
const NOW = Date.parse("2026-11-19T16:32:27Z");
const base = {
  id: "job-1", userId: "user-1", name: "Nightly report (drill)", token: "tok", project: null, owner: null, maxRunMinutes: null, minCount: null,
  periodMinutes: 5, graceMinutes: 5, schedule: null, timeZone: null, probe: null, source: "manual", evidenceState: "ok", path: null,
  status: "retired", lastPingAt: new Date(NOW - 5 * MIN), lastPingKind: "ok", lastNote: null, missCount: 0,
  nextDueAt: new Date(NOW), createdAt: new Date(NOW - 24 * 60 * MIN), updatedAt: new Date(NOW - 5 * MIN),
};
let row: Record<string, unknown>;
let updates: Record<string, unknown>[] = [];
const db = {
  select: () => ({ from: () => ({ where: () => Object.assign(Promise.resolve([row]), { limit: async () => [row] }) }) }),
  insert: () => ({ values: () => Object.assign(Promise.resolve(), { onConflictDoNothing: () => ({ returning: async () => [{ id: "a" }] }) }) }),
  update: () => ({ set: (v: Record<string, unknown>) => { updates.push(v); return { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ ...row, ...v }] }) }; } }),
};

beforeEach(() => {
  row = { ...base };
  updates = [];
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(getDb).mockReturnValue(db as never);
});
afterEach(() => vi.useRealTimers());

describe("retired jobs stay silent", () => {
  it("restoring a retired job starts it fresh: due one period from now, no missed check-ins", async () => {
    row = { ...base, status: "retired", nextDueAt: new Date(NOW - 40 * MIN), missCount: 5, lastPingAt: new Date(NOW - 50 * MIN) };
    const job = await updateJob("user-1", "job-1", { retired: false }, "test");
    const set = updates[0];
    expect(set.status).toBe("up");
    expect(set.missCount).toBe(0);
    expect((set.nextDueAt as Date).getTime()).toBe(NOW + 5 * MIN);
    expect(job?.status).toBe("up");
  });

  it("un-pausing restarts the clock the same way", async () => {
    row = { ...base, status: "paused", nextDueAt: new Date(NOW - 40 * MIN), missCount: 3 };
    await updateJob("user-1", "job-1", { paused: false }, "test");
    expect(updates[0].missCount).toBe(0);
    expect((updates[0].nextDueAt as Date).getTime()).toBe(NOW + 5 * MIN);
  });
});
