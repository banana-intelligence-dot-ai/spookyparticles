import { describe, expect, it } from "vitest";
import { installationDisplay, installationVerdict } from "./github-installation-policy";

const now = Date.UTC(2026, 10, 2, 12, 0, 0);
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

const personal = (id: number) => ({ account: { id, login: "nate", type: "User" }, created_at: minutesAgo(600) });
const org = (createdMinutesAgo: number) => ({ account: { id: 99, login: "acme", type: "Organization" }, created_at: minutesAgo(createdMinutesAgo) });

describe("installationVerdict", () => {
  it("links a personal install only to one of the user's linked GitHub accounts", () => {
    const base = { userCanSee: true, viaInstallFlow: false, nowMs: now };
    expect(installationVerdict(personal(7), { ...base, githubUserIds: ["7"] })).toBe("ok");
    expect(installationVerdict(personal(7), { ...base, githubUserIds: ["8", "7"] })).toBe("ok");
    expect(installationVerdict(personal(7), { ...base, githubUserIds: ["8"] })).toBe("not_yours");
    expect(installationVerdict(personal(7), { ...base, githubUserIds: [] })).toBe("not_yours");
  });

  it("links an org install only when it came through this user's fresh install flow", () => {
    const ctx = { githubUserIds: ["7"], userCanSee: true, viaInstallFlow: true, nowMs: now };
    expect(installationVerdict(org(2), ctx)).toBe("ok");
    expect(installationVerdict(org(60), ctx)).toBe("org_needs_install_link");
    expect(installationVerdict(org(2), { ...ctx, viaInstallFlow: false })).toBe("org_needs_install_link");
    expect(installationVerdict(org(2), { ...ctx, userCanSee: false })).toBe("not_yours");
  });

  it("treats enterprise installs (no type) like orgs", () => {
    const ent = { account: { id: 5, slug: "big-co" }, created_at: minutesAgo(1) };
    expect(installationVerdict(ent, { githubUserIds: ["5"], userCanSee: true, viaInstallFlow: false, nowMs: now })).toBe(
      "org_needs_install_link",
    );
    expect(installationDisplay({ id: 1, ...ent })).toBe("big-co");
  });
});
