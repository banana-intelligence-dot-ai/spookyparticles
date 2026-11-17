import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db";
import { deliverToAll } from "./alerts/channels";
import { pageGithub, pagerEnabled } from "./pager";
import { notifyJob } from "./checkins";

vi.mock("@/db", async (original) => ({ ...await original(), getDb: vi.fn() }));
vi.mock("./pager", () => ({ pagerEnabled: vi.fn(), pageGithub: vi.fn() }));
vi.mock("./alerts/channels", () => ({ matchesProject: (a: string, b: string) => a === b, deliverToAll: vi.fn() }));
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn() }));
vi.mock("@/lib/analytics/server", () => ({ track: vi.fn() }));
vi.mock("@/lib/env", () => ({ appUrl: () => "https://spooky.example" }));
// The real module loads the incident and listening code; these tests are about the pager.
vi.mock("./claims", () => ({ claimsFor: vi.fn().mockResolvedValue([]), claimFor: vi.fn().mockReturnValue(null) }));
vi.mock("./agent-first", () => ({ shouldDeferToAgent: vi.fn().mockResolvedValue(false) }));

const job = { id: "job-1", userId: "user-1", name: "Daily check", project: "owner/repo", missCount: 1 };
const notice = { subject: "Daily check: quiet", text: "Daily check is down", priority: "high" as const, key: "job_quiet:job-1:1" };
let channelReads = 0;
let updates: unknown[] = [];
const db = {
  select: () => ({ from: (table: unknown) => ({ where: () => {
    if (table === schema.alertChannels) { channelReads++; return [{ id: "channel-1", kind: "github", project: "owner/repo", enabled: true }]; }
    return { limit: async () => [{ email: "person@example.com" }] };
  } }) }),
  insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "alert-1" }] }) }) }),
  update: () => ({ set: (value: unknown) => { updates.push(value); return { where: async () => undefined }; } }),
};

beforeEach(() => {
  channelReads = 0;
  updates = [];
  vi.clearAllMocks();
  vi.mocked(getDb).mockReturnValue(db as never);
  vi.mocked(deliverToAll).mockResolvedValue([{ kind: "email", label: "account email", ok: true }]);
});

describe("notifyJob GitHub pager", () => {
  it("records a deferred alert and skips people after a dispatch", async () => {
    vi.mocked(pagerEnabled).mockReturnValue(true);
    vi.mocked(pageGithub).mockResolvedValue({ ok: true });
    await notifyJob(job as never, "job_quiet", notice);
    expect(pageGithub).toHaveBeenCalledWith("user-1", expect.objectContaining({ alertKey: notice.key }), notice.text);
    expect(deliverToAll).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
  });
  it("alerts people with the GitHub reason when dispatch fails", async () => {
    vi.mocked(pagerEnabled).mockReturnValue(true);
    vi.mocked(pageGithub).mockResolvedValue({ ok: false, reason: "http 500" });
    await notifyJob(job as never, "job_quiet", notice);
    expect(deliverToAll).toHaveBeenCalledWith("user-1", expect.objectContaining({ text: `${notice.text}\nSpooky couldn't start the GitHub fix job: http 500` }), "owner/repo");
  });
  it("does not start the fix job when an agent already claimed the project, and tells people instead", async () => {
    const { claimFor } = await import("./claims");
    vi.mocked(claimFor).mockReturnValueOnce({ project: "owner/repo" } as never);
    vi.mocked(pagerEnabled).mockReturnValue(true);
    await notifyJob(job as never, "job_quiet", notice);
    expect(pageGithub).not.toHaveBeenCalled();
    expect(deliverToAll).toHaveBeenCalledWith("user-1", expect.objectContaining({ text: notice.text }), "owner/repo");
  });
  it("keeps the old human delivery path when the pager is off", async () => {
    vi.mocked(pagerEnabled).mockReturnValue(false);
    await notifyJob(job as never, "job_quiet", notice);
    expect(channelReads).toBe(0);
    expect(pageGithub).not.toHaveBeenCalled();
    expect(deliverToAll).toHaveBeenCalledWith("user-1", expect.objectContaining({ text: notice.text }), "owner/repo");
  });
});
