import { expect, it } from "vitest";
import { commitOutcome, deploySeenRows } from "./commit-outcome";

const deployments = [
  { environment: "production", sha: "a1b2c3d4455", state: "success", at: "2026-11-10T10:00:00Z" },
  { environment: "preview", sha: "b1b2c3d4455", state: "error", at: "2026-11-10T11:00:00Z" },
];

it("pairs a live commit with breaks until the next production deploy", () => {
  expect(commitOutcome("a1b2c3d", deployments, [
    { project: "owner/repo", kind: "site", what: "Site down", caughtAt: "2026-11-10T10:05:00Z", fixedAt: "2026-11-10T10:25:00Z", fixedBy: { kind: "commit", sha: "c1b2c3d", message: null }, commitSha: null },
  ], "owner/repo")).toEqual({ sha: "a1b2c3d", deployed: true, broke: [{ what: "Site down", at: "2026-11-10T10:05:00Z" }], fixed: { at: "2026-11-10T10:25:00Z", by: "c1b2c3d" }, minutesToFix: 20 });
});

it("reports failed deploys and unknown commits", () => {
  const catches = [{ project: "owner/repo", kind: "deploy" as const, what: "Deploy failed", caughtAt: "2026-11-10T11:00:00Z", fixedAt: null, fixedBy: null, commitSha: "b1b2c3d4455" }];
  expect(commitOutcome("b1b2c3d", deployments, catches, "owner/repo")).toMatchObject({ deployed: false, broke: [{ what: "Deploy failed" }], fixed: null });
  expect(commitOutcome("fffffff", deployments, catches, "owner/repo")).toEqual({ sha: "fffffff", deployed: null, broke: [], fixed: null, minutesToFix: null });
});

it("stops attributing breaks at the next production deploy", () => {
  const later = { environment: "production", sha: "c1b2c3d4455", state: "success", at: "2026-11-10T10:30:00Z" };
  const catches = [
    { project: "owner/repo", kind: "site" as const, what: "Early", caughtAt: "2026-11-10T10:10:00Z", fixedAt: null, fixedBy: null },
    { project: "owner/repo", kind: "site" as const, what: "Later", caughtAt: "2026-11-10T10:40:00Z", fixedAt: null, fixedBy: null },
    { project: "other/repo", kind: "site" as const, what: "Other", caughtAt: "2026-11-10T10:12:00Z", fixedAt: null, fixedBy: null },
  ];
  expect(commitOutcome("a1b2c3d", [...deployments, later], catches, "owner/repo").broke).toEqual([{ what: "Early", at: "2026-11-10T10:10:00Z" }]);
});

it("keeps finished production deploys once, so old commits still answer", () => {
  const rows = deploySeenRows("u1", "Owner/Repo", [
    { id: "d1", state: "READY", createdAt: "2026-11-10T10:00:00.000Z", sha: "a1b2c3d" },
    { id: "d2", state: "BUILDING", createdAt: "2026-11-10T11:00:00.000Z", sha: "b1b2c3d" },
    { id: "d3", state: "ERROR", createdAt: "2026-11-10T12:00:00.000Z", sha: "c1b2c3d" },
    { id: "d4", state: "READY", createdAt: "2026-11-10T13:00:00.000Z", sha: null },
    { id: "d5", state: "READY", createdAt: "2026-11-10T14:00:00.000Z", sha: "e1b2c3d" },
  ], new Set(["vercel:d5"]));
  expect(rows.map((r) => [r.properties.key, r.properties.state, r.properties.repo])).toEqual([["vercel:d1", "success", "owner/repo"], ["vercel:d3", "failure", "owner/repo"]]);
  const seen = rows.map((r) => ({ environment: "production", sha: r.properties.sha, state: r.properties.state, at: r.properties.at }));
  expect(commitOutcome("a1b2c3d", seen, [], "owner/repo").deployed).toBe(true);
  expect(commitOutcome("c1b2c3d", seen, [], "owner/repo").deployed).toBe(false);
});
