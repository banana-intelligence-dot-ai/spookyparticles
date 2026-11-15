import { describe, expect, it } from "vitest";
import { formatSetupText, nextSetupStep, setupStatus, type SetupConnectionStatus, type SetupStatus } from "./setup-status";

describe("setup next step", () => {
  const connect = "https://spooky.example/app";

  it.each([
    ["missing", "synced", 0, `Connect GitHub and Vercel at ${connect}.`],
    ["synced", "syncing", 0, "First read is running. This takes a minute or two."],
    ["errored", "synced", 0, `A connection needs attention at ${connect}.`],
    ["synced", "synced", 2, "2 broken now. Read them with: sh scripts/spooky.sh problems"],
    ["synced", "synced", 0, "All clear. Turn on agent alerts next: sh scripts/spooky.sh alerts"],
  ] satisfies [SetupConnectionStatus, SetupConnectionStatus, number, string][])(
    "handles %s and %s with %s broken",
    (github, vercel, broken, expected) => {
      expect(nextSetupStep(github, vercel, broken, connect)).toBe(expected);
    },
  );
});

describe("setup status", () => {
  it("counts only completed active host connections as ready", () => {
    const status = setupStatus({
      connections: [
        { provider: "github", status: "active", sync: { phase: "done", finishedAt: "now" } },
        { provider: "vercel", status: "active", sync: { phase: "search", finishedAt: null } },
      ],
      incidents: { incidents: [{ kind: "deploy_failed" }] },
      jobs: [
        { status: "up", watched: true },
        { status: "late", watched: true },
        { status: "paused", watched: false },
      ],
      projects: { projects: [{ elsewhere: { host: "Netlify" } }, { elsewhere: null }] },
    }, "https://spooky.example");

    expect(status).toMatchObject({
      ready: false,
      github: "synced",
      vercel: "syncing",
      broken: 1,
      jobs: { total: 3, watched: 2, issues: 1 },
      elsewhere: 1,
      links: { connect: "https://spooky.example/app", today: "https://spooky.example/app", jobs: "https://spooky.example/app/jobs" },
    });
  });

  it("falls back to treating all jobs as watched when that field is absent", () => {
    const status = setupStatus({ connections: [], incidents: { incidents: [] }, jobs: [{ status: "up" }, { status: "down" }], projects: { projects: [] } }, "https://spooky.example");
    expect(status.jobs).toEqual({ total: 2, watched: 2, issues: 1 });
  });
});

describe("setup text", () => {
  it("uses short safe lines for an agent", () => {
    const status: SetupStatus = {
      ready: false,
      github: "synced",
      vercel: "missing",
      broken: 0,
      jobs: { total: 12, watched: 12, issues: 1 },
      elsewhere: 2,
      next: "Connect GitHub and Vercel at https://spooky.example/app.",
      links: { connect: "https://spooky.example/app", today: "https://spooky.example/app", jobs: "https://spooky.example/app/jobs" },
    };

    const text = formatSetupText(status);
    expect(text).toContain("GitHub: synced\nVercel: waiting (connect it at https://spooky.example/app)");
    expect(text).toContain("Scheduled jobs: 12 watched, 1 needs a look");
    expect(text).toContain("Still on another host: 2");
    expect(text).not.toMatch(/[\u2013\u2014]/);
    expect(text.toLowerCase()).not.toContain("ping");
    expect(text.toLowerCase()).not.toContain("token");
  });
});
