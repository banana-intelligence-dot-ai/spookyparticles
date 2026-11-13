import { describe, expect, it } from "vitest";
import { wiring } from "./wiring-map";
import type { Connection } from "../connection-model";
import type { AgentKey } from "./agents";

const NOW = Date.parse("2026-11-02T18:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const conn = (id: string, o: Partial<Connection>) => ({ id, provider: "github", display: id, status: "active", statusReason: null, scopes: [], createdAt: ago(900), lastSyncedAt: ago(1), sync: null, ...o }) as Connection;
const key = (id: string, o: Partial<AgentKey>) => ({ id, name: id, prefix: "sp_x", scopes: ["read"], createdAt: ago(900), lastUsedAt: ago(1), revokedAt: null, ...o }) as AgentKey;

describe("wiring", () => {
  it("marks each line live, stale, broken or never, and leaves out revoked rows", () => {
    const out = wiring(
      [conn("a", {}), conn("b", { lastSyncedAt: ago(72) }), conn("c", { status: "errored", statusReason: "Suspended" }), conn("d", { status: "revoked" }), conn("e", { lastSyncedAt: null })],
      [key("k1", {}), key("k2", { lastUsedAt: ago(24 * 10) }), key("k3", { lastUsedAt: null }), key("k4", { revokedAt: ago(5) })],
      NOW,
    );
    expect(out.map((n) => [n.id, n.wire])).toEqual([
      ["a", "live"],
      ["b", "stale"],
      ["c", "broken"],
      ["e", "never"],
      ["k1", "live"],
      ["k2", "stale"],
      ["k3", "never"],
    ]);
    expect(out.find((n) => n.id === "c")?.line).toBe("Suspended");
  });

  it("sends a broken inbox straight to sign in again, and a dropped GitHub app to GitHub", () => {
    const out = wiring([conn("g", { provider: "gmail", status: "errored" }), conn("h", { status: "errored" }), conn("ok", { provider: "gmail" })], [], NOW);
    expect(out.find((n) => n.id === "g")?.fix).toEqual({ href: "/api/connect/gmail/start?next=/app/connections", label: "Reconnect", external: false });
    expect(out.find((n) => n.id === "h")?.fix?.label).toBe("Fix on GitHub");
    expect(out.find((n) => n.id === "ok")?.fix).toBeNull();
  });
});
