import { describe, expect, it } from "vitest";
import { belongsOnlyToConnection, connectionDueForPurge } from "./purge";

describe("revoked connection purge decisions", () => {
  const now = Date.UTC(2026, 10, 10);
  it("waits 30 days and skips rows already purged", () => {
    const row = { status: "revoked" as const, revokedAt: new Date(now - 30 * 86_400_000), externalAccountId: "acct" };
    expect(connectionDueForPurge(row, now)).toBe(true);
    expect(connectionDueForPurge({ ...row, revokedAt: new Date(now - 30 * 86_400_000 + 1) }, now)).toBe(false);
    expect(connectionDueForPurge({ ...row, status: "active" }, now)).toBe(false);
    expect(connectionDueForPurge({ ...row, externalAccountId: "purged:abc" }, now)).toBe(false);
  });
  it("attributes provider rows only when that provider has one connection", () => {
    const connection = { id: "c1", provider: "vercel" as const };
    expect(belongsOnlyToConnection("vercel", connection, ["c1"])).toBe(true);
    expect(belongsOnlyToConnection("github", connection, ["c1"])).toBe(false);
    expect(belongsOnlyToConnection("vercel", connection, ["c1", "c2"])).toBe(false);
  });
});
