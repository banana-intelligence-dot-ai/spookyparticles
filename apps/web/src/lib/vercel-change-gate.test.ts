import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { deploymentFingerprint, shouldSkipVercelSync, VERCEL_FULL_SYNC_MS, withFingerprint } from "./vercel-change-gate";

const NOW = Date.parse("2026-11-19T12:30:00Z");
const saved = deploymentFingerprint([{ uid: "dpl_1", state: "BUILDING", readyState: "BUILDING", target: "production" }]);

describe("Vercel deployment change gate", () => {
  it("fingerprints only id, state, readyState and target, including status transitions", () => {
    const withExtra = deploymentFingerprint([{ uid: "dpl_1", state: "BUILDING", readyState: "BUILDING", target: "production", url: "ignored.example" }]);
    expect(withExtra).toBe(saved);
    expect(deploymentFingerprint([{ uid: "dpl_1", state: "ERROR", readyState: "ERROR", target: "production" }])).not.toBe(saved);
    expect(deploymentFingerprint([{ uid: "dpl_2", state: "BUILDING", readyState: "BUILDING", target: "production" }])).not.toBe(saved);
    expect(() => deploymentFingerprint({ deployments: [] })).toThrow();
  });

  const decision = (overrides: Partial<Parameters<typeof shouldSkipVercelSync>[0]> = {}) => shouldSkipVercelSync({
    actor: "system:watch", saved, current: saved, lastSyncedAt: new Date(NOW - 5 * 60_000), nowMs: NOW, lastRunSucceeded: true, ...overrides,
  });

  it("skips an unchanged, fresh watch", () => expect(decision()).toBe(true));
  it("runs when a deployment changes", () => expect(decision({ current: deploymentFingerprint([{ uid: "dpl_1", state: "ERROR", target: "production" }]) })).toBe(false));
  it("runs when the last full sync is at least 60 minutes old", () => expect(decision({ lastSyncedAt: new Date(NOW - VERCEL_FULL_SYNC_MS) })).toBe(false));
  it("runs when the gate read fails", () => expect(decision({ gateError: true })).toBe(false));
  it("runs when the last workflow failed", () => expect(decision({ lastRunSucceeded: false })).toBe(false));
  it("runs for a non-watch actor", () => expect(decision({ actor: "user:1" })).toBe(false));
  it("runs in the hourly billing window", () => expect(decision({ hourlyDue: true })).toBe(false));

  it("types both jsonb_build_object parameters, so Postgres accepts the write", () => {
    const q = new PgDialect().sqlToQuery(withFingerprint("fp"));
    expect(q.sql).toMatch(/jsonb_build_object\(\$\d+::text, \$\d+::text\)/);
    expect(q.params).toEqual(["vercel_deploy_fingerprint", "fp"]);
  });
});
