import { describe, expect, it } from "vitest";
import { pushNoDeploy, STALE_PUSH_MS } from "./push-no-deploy";

const now = Date.parse("2026-11-19T12:00:00Z");
const at = new Date(now - STALE_PUSH_MS - 1).toISOString();
const base = { head: { sha: "ABCDEF123456", at }, linkedToVercel: true, archived: false, deployments: [] as { sha: string | null; at: string | null }[], nowMs: now };

describe("pushNoDeploy", () => {
  it("finds an old default-branch head with no Vercel deployment", () => {
    expect(pushNoDeploy(base)).toMatchObject({ sha: base.head.sha, at, minutesSince: 20 });
  });
  it("requires a Vercel link, an active repo, and a known head", () => {
    expect(pushNoDeploy({ ...base, linkedToVercel: false })).toBeNull();
    expect(pushNoDeploy({ ...base, archived: true })).toBeNull();
    expect(pushNoDeploy({ ...base, head: null })).toBeNull();
  });
  it("waits until the stale-push threshold has passed", () => {
    expect(pushNoDeploy({ ...base, head: { ...base.head, at: new Date(now - STALE_PUSH_MS).toISOString() } })).toBeNull();
  });
  it("accepts either case-insensitive SHA prefix, regardless of state", () => {
    expect(pushNoDeploy({ ...base, deployments: [{ sha: "abcdef1", at: null }] })).toBeNull();
    expect(pushNoDeploy({ ...base, deployments: [{ sha: "ABCDEF123456789", at: null }] })).toBeNull();
  });
  it("requires the head to be newer than the newest deployment", () => {
    expect(pushNoDeploy({ ...base, deployments: [{ sha: "other", at }] })).toBeNull();
    expect(pushNoDeploy({ ...base, deployments: [{ sha: "other", at: new Date(now).toISOString() }] })).toBeNull();
    expect(pushNoDeploy({ ...base, deployments: [{ sha: "other", at: new Date(Date.parse(at) - 1).toISOString() }] })).not.toBeNull();
  });
});
