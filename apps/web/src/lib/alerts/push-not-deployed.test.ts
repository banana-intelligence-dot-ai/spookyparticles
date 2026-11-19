import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { deliverToAll } from "./channels";
import { notifyPushNotDeployed } from "./push-not-deployed";

vi.mock("@/db", async (original) => ({ ...await original(), getDb: vi.fn() }));
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn() }));
vi.mock("@/lib/env", () => ({ appUrl: () => "https://spooky.example" }));
vi.mock("@/lib/mutes", () => ({ alertMuted: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/ignores", () => ({ ignoredKeys: vi.fn().mockResolvedValue(new Set()) }));
vi.mock("./channels", () => ({ deliverToAll: vi.fn().mockResolvedValue([{ kind: "email", ok: true }]) }));
vi.mock("./deploy-failed", () => ({ deployFailedEnabled: vi.fn().mockResolvedValue(true), optOutUrl: () => "https://spooky.example/unsubscribe" }));

const finding = { project: "owner/repo", sha: "ABCDEF123456", at: "2026-11-19T11:00:00Z", branch: "main", message: "Ship", minutesSince: 60, lastDeployAt: null };

describe("push alert pager", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("claims one alert per project and head SHA before delivery", async () => {
    const keys = new Set<string>();
    vi.mocked(getDb).mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values: (row: { key: string }) => ({ onConflictDoNothing: () => ({ returning: async () => {
        if (keys.has(row.key)) return [];
        keys.add(row.key);
        return [{ id: row.key }];
      } }) }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    } as never);
    expect(await notifyPushNotDeployed("user-1", finding)).toBe("sent");
    expect(await notifyPushNotDeployed("user-1", finding)).toBe("skipped");
    expect(await notifyPushNotDeployed("user-1", { ...finding, sha: "987654ABCDEF" })).toBe("sent");
    expect(deliverToAll).toHaveBeenCalledTimes(2);
    expect([...keys]).toEqual(["push_not_deployed:owner/repo:abcdef123456", "push_not_deployed:owner/repo:987654abcdef"]);
  });
});
