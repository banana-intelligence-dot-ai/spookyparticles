import { expect, it } from "vitest";
import { projectUsage, serviceUsage, type ProjectFacts } from "./usage";

const now = Date.parse("2026-11-11T12:00:00Z");
const base: ProjectFacts = { project: "team/app", paused: false, productionAt: null, lastTrafficAt: null, trafficReadSince: null };

it("calls a project in use on a production deploy or real traffic in the last 30 days", () => {
  expect(projectUsage({ ...base, productionAt: "2026-11-03T10:00:00Z" }, now)).toEqual({ project: "team/app", state: "in_use", reason: "production deploy 2026-11-03" });
  expect(projectUsage({ ...base, productionAt: "2026-08-01T00:00:00Z", lastTrafficAt: "2026-11-10T09:00:00Z", trafficReadSince: "2026-10-01T00:00:00Z" }, now))
    .toMatchObject({ state: "in_use", reason: "requests seen 2026-11-10" });
  expect(projectUsage({ ...base, productionAt: "2026-10-12T12:00:00Z" }, now).state).toBe("in_use");
});

it("calls a project idle when paused, never deployed, or quiet for 30 days, and says on what basis", () => {
  expect(projectUsage({ ...base, paused: true, productionAt: "2026-11-10T00:00:00Z" }, now)).toMatchObject({ state: "idle", reason: "paused on Vercel" });
  expect(projectUsage(base, now)).toMatchObject({ state: "idle", reason: "never deployed to production, traffic not readable" });
  expect(projectUsage({ ...base, productionAt: "2026-09-01T00:00:00Z", lastTrafficAt: "2026-09-02T00:00:00Z", trafficReadSince: "2026-08-01T00:00:00Z" }, now))
    .toMatchObject({ state: "idle", reason: "no production deploy since 2026-09-01, no requests in 30 days" });
  expect(projectUsage({ ...base, productionAt: "2026-09-01T00:00:00Z", trafficReadSince: "2026-11-09T00:00:00Z" }, now).reason)
    .toBe("no production deploy since 2026-09-01, no requests seen since 2026-11-09");
});

it("keeps a service in use while any project using it is in use", () => {
  const quiet = { ...base, project: "team/old", productionAt: "2026-01-01T00:00:00Z" };
  const live = { ...base, project: "team/new", productionAt: "2026-11-01T00:00:00Z" };
  expect(serviceUsage([quiet, live], now)).toMatchObject({ state: "in_use", basis: "In use: team/new (production deploy 2026-11-01)." });
  const idle = serviceUsage([{ ...quiet, trafficReadSince: "2026-08-01T00:00:00Z" }, { ...live, paused: true }], now);
  expect(idle.state).toBe("idle");
  expect(idle.basis).toBe("Idle: team/new (paused on Vercel); team/old (no production deploy since 2026-01-01, no requests in 30 days).");
});

it("says unknown, not idle, when an old deploy may still get requests nobody can read", () => {
  expect(projectUsage({ ...base, productionAt: "2026-01-01T00:00:00Z" }, now)).toMatchObject({ state: "unknown", reason: "no production deploy since 2026-01-01, traffic not readable" });
  const svc = serviceUsage([{ ...base, project: "team/old", productionAt: "2026-01-01T00:00:00Z" }, { ...base, project: "team/off", paused: true }], now);
  expect(svc).toMatchObject({ state: "unknown", basis: "Unknown: team/off (paused on Vercel); team/old (no production deploy since 2026-01-01, traffic not readable)." });
});
