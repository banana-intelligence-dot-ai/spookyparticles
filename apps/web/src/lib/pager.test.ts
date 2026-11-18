import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { getInstallationToken } from "@/lib/connections";
import { locateRepo } from "@/lib/github-refresh";
import { alarmLine, alarmsFor } from "./alarms";
import { appendAudit } from "@/lib/audit";
import { dueEscalations, FIX_RULE, MAX_ROUNDS, pageGithub, pagerWhat, roundsReason, roundsSpent, type EscalationJob, type Paged } from "./pager";

vi.mock("@/db", async (original) => ({ ...await original(), getDb: vi.fn() }));
vi.mock("@/lib/connections", () => ({ getInstallationToken: vi.fn() }));
vi.mock("@/lib/github-refresh", () => ({ locateRepo: vi.fn() }));
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "owner/repo" }));
vi.mock("@/lib/env", () => ({ appUrl: () => "https://spooky.example" }));
vi.mock("@/lib/alerts/channels", () => ({ matchesProject: (a: string, b: string) => a === b, deliverToAll: vi.fn() }));
vi.mock("./alarms", async (original) => ({ ...await original<typeof import("./alarms")>(), alarmsFor: vi.fn() }));

const channel = { id: "channel-1", kind: "github", project: "owner/repo", encryptedTarget: "sealed" };
const db = {
  select: () => ({ from: () => ({ where: async () => [channel] }) }),
  insert: () => ({ values: async () => undefined }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
};
const job = { id: "job-1", name: "Daily check", project: "owner/repo" };

beforeEach(() => {
  vi.mocked(getDb).mockReturnValue(db as never);
  vi.mocked(locateRepo).mockResolvedValue({ repo: { id: "repo-1", name: "owner/repo" }, accountNodeId: "node-1", connectionId: "connection-1" });
  vi.mocked(getInstallationToken).mockResolvedValue("secret-installation-token");
  vi.mocked(alarmsFor).mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("GitHub dispatch", () => {
  it("sends the default branch and sanitized inputs with the installation headers", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: "main" }) }).mockResolvedValueOnce({ status: 204 });
    vi.stubGlobal("fetch", fetcher);
    expect(await pageGithub("user-1", job, "broken\n\u0000very bad")).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/repo");
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe("https://api.github.com/repos/owner/repo/actions/workflows/spooky-fix.yml/dispatches");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { Authorization: "Bearer secret-installation-token", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "spooky-particles" } });
    expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { project: "owner/repo", check: "Daily check", what: `broken very bad ${FIX_RULE}`, link: "https://spooky.example/app/jobs" } });
  });
  it.each([[403, "Spooky needs permission to start Actions in this repo (Actions: write on the Spooky GitHub app)."], [404, "No .github/workflows/spooky-fix.yml in this repo's default branch, or Spooky can't see the repo."]])("maps HTTP %i without leaking the token", async (status, reason) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: "main" }) }).mockResolvedValueOnce({ status }));
    const result = await pageGithub("user-1", job, "broken");
    expect(result).toEqual({ ok: false, reason });
    expect(JSON.stringify(result)).not.toContain("secret-installation-token");
  });
  it("does not return a token from thrown requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-installation-token")));
    expect(await pageGithub("user-1", job, "broken")).toEqual({ ok: false, reason: "GitHub request failed." });
  });
  it("puts an alarm instruction first and keeps the fix rule last", async () => {
    const alarm = { key: "owner/repo|daily check", project: "owner/repo", check: "Daily check", note: "30% floor", at: "2026-11-16T12:00:00.000Z", by: "you" };
    vi.mocked(alarmsFor).mockResolvedValue([alarm]);
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: "main" }) }).mockResolvedValueOnce({ status: 204 });
    vi.stubGlobal("fetch", fetcher);
    expect(await pageGithub("user-1", job, "Visual coverage is 12%.")).toEqual({ ok: true });
    const what = JSON.parse(fetcher.mock.calls[1][1].body).inputs.what as string;
    expect(what.startsWith(alarmLine(alarm))).toBe(true);
    expect(what.endsWith(FIX_RULE)).toBe(true);
  });

  it("finds the alarm by name inside a message that names owner/repo", async () => {
    const alarm = { key: "owner/repo|watch visual coverage", project: "owner/repo", check: "Watch visual coverage", note: null, at: "2026-11-16T12:00:00.000Z", by: "you" };
    vi.mocked(alarmsFor).mockResolvedValue([alarm]);
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: "main" }) }).mockResolvedValueOnce({ status: 204 });
    vi.stubGlobal("fetch", fetcher);
    await pageGithub("user-1", { ...job, name: "break" }, "Watch visual coverage failed on owner/repo.");
    const what = JSON.parse(fetcher.mock.calls[1][1].body).inputs.what as string;
    expect(what.startsWith(alarmLine(alarm))).toBe(true);
  });
});

describe("dueEscalations", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const paged: Paged = { jobId: "job-1", userId: "user-1", project: "owner/repo", alertKey: "first", at: new Date(now - 15 * 60_000).toISOString() };
  const down: EscalationJob = { id: "job-1", userId: "user-1", name: "Daily check", project: "owner/repo", status: "down", lastNote: null };
  it("waits fifteen minutes, skips escalated and recovered jobs, and selects due jobs", () => {
    const jobs = new Map([[down.id, down]]);
    expect(dueEscalations([{ ...paged, at: new Date(now - 14 * 60_000).toISOString() }], new Set(), jobs, now)).toEqual([]);
    expect(dueEscalations([paged], new Set([down.id]), jobs, now)).toEqual([]);
    expect(dueEscalations([paged], new Set(), new Map([[down.id, { ...down, status: "up" }]]), now)).toEqual([]);
    expect(dueEscalations([paged], new Set(), jobs, now)).toEqual([paged]);
  });
});

describe("what the fix job is told", () => {
  it("always ends with the rule never to weaken a check, even when the report is long", () => {
    const long = pagerWhat("x".repeat(500));
    expect(long.length).toBeLessThanOrEqual(300);
    expect(long.endsWith(FIX_RULE)).toBe(true);
    expect(pagerWhat("Visual coverage 12% is under the 30% floor.")).toBe(`Visual coverage 12% is under the 30% floor. ${FIX_RULE}`);
  });
  it("names thresholds, so a job asked to fix a floor alarm does not lower the floor", () => {
    expect(FIX_RULE).toMatch(/no lower thresholds/);
  });
});

describe("three rounds, then a person", () => {
  const at = (d: string) => new Date(`2026-11-${d}T06:10:00.000Z`);
  const rounds = [{ after: { ok: true }, createdAt: at("14") }, { after: { ok: false }, createdAt: at("13") }, { after: { ok: true }, createdAt: at("12") }, { after: { ok: true }, createdAt: at("16") }];
  const withRounds = (rows: unknown[]) => {
    const answers = [[channel], rows];
    return { ...db, select: () => ({ from: () => ({ where: async () => answers.shift() ?? [] }) }) };
  };

  it("counts only runs that started, oldest first", () => {
    expect(roundsSpent(rounds)).toEqual([at("12"), at("14"), at("16")]);
    expect(roundsSpent([{ after: null, createdAt: at("12") }])).toEqual([]);
  });

  it("tells the person when the runs were and where to see them", () => {
    expect(roundsReason([at("12"), at("14"), at("16")], "owner/repo")).toBe("3 fix runs for this check in 7 days didn't hold (11-12 06:10, 11-14 06:10, 11-16 06:10 UTC), so Spooky stopped starting new ones. It's over to you. The runs: https://github.com/owner/repo/actions/workflows/spooky-fix.yml");
  });

  it("stops the pager after three runs that didn't hold, and audits it", async () => {
    vi.mocked(getDb).mockReturnValue(withRounds(rounds) as never);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await pageGithub("user-1", job, "broken");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(`${MAX_ROUNDS} fix runs`);
    expect(fetcher).not.toHaveBeenCalled();
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "pager.rounds_exhausted", target: "job-1" }));
  });

  it("still starts a run under the limit, and when a person sends it by hand", async () => {
    vi.mocked(getDb).mockReturnValue(withRounds(rounds.slice(0, 2)) as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: "main" }) }).mockResolvedValueOnce({ status: 204 }));
    expect(await pageGithub("user-1", job, "broken")).toEqual({ ok: true });
    vi.mocked(getDb).mockReturnValue(withRounds(rounds) as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ default_branch: "main" }) }).mockResolvedValueOnce({ status: 204 }));
    expect(await pageGithub("user-1", job, "broken", "user:nate")).toEqual({ ok: true });
  });
});
