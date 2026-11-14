import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { getInstallationToken } from "@/lib/connections";
import { locateRepo } from "@/lib/github-refresh";
import { dueEscalations, pageGithub, type EscalationJob, type Paged } from "./pager";

vi.mock("@/db", async (original) => ({ ...await original(), getDb: vi.fn() }));
vi.mock("@/lib/connections", () => ({ getInstallationToken: vi.fn() }));
vi.mock("@/lib/github-refresh", () => ({ locateRepo: vi.fn() }));
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "owner/repo" }));
vi.mock("@/lib/env", () => ({ appUrl: () => "https://spooky.example" }));
vi.mock("@/lib/alerts/channels", () => ({ matchesProject: (a: string, b: string) => a === b, deliverToAll: vi.fn() }));

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
    expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { project: "owner/repo", check: "Daily check", what: "broken very bad", link: "https://spooky.example/app/jobs" } });
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
