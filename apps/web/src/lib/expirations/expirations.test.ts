import { describe, expect, it } from "vitest";
import { alertThreshold, expirations } from "./expirations";

const node = (kind: "project" | "domain", name: string, attributes: Record<string, unknown>) => ({ kind, name, attributes });

describe("expirations", () => {
  it("uses only published Vercel runtime dates and sorts dated items", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    expect(expirations([
      node("project", "new", { provider: "vercel", node_version: "22.x" }),
      node("project", "old", { provider: "vercel", node_version: "20.x" }),
      node("domain", "example.com", { provider: "vercel", expires_at: "2026-09-08T00:00:00Z", auto_renew: true }),
      node("domain", "elsewhere.com", { provider: "vercel" }),
    ], now)).toEqual([
      { kind: "domain", name: "example.com", date: "2026-09-08", daysLeft: 7, autoRenew: true },
      { kind: "node_runtime", name: "Node.js 20.x", project: "old", date: "2026-10-01", daysLeft: 30 },
    ]);
  });

  it("alerts once at each reached window, with auto-renew only inside seven days", () => {
    expect(alertThreshold({ kind: "domain", name: "a", date: "2026-10-01", daysLeft: 30, autoRenew: true })).toBe(null);
    expect(alertThreshold({ kind: "domain", name: "a", date: "2026-10-01", daysLeft: 7, autoRenew: true })).toBe(7);
    expect(alertThreshold({ kind: "domain", name: "a", date: "2026-10-01", daysLeft: 1, autoRenew: true })).toBe(1);
    expect(alertThreshold({ kind: "node_runtime", name: "Node.js 20.x", project: "p", date: "2026-10-01", daysLeft: 30 })).toBe(30);
    expect(alertThreshold({ kind: "node_runtime", name: "Node.js 20.x", project: "p", date: "2026-10-01", daysLeft: -1 })).toBe(null);
  });
});
