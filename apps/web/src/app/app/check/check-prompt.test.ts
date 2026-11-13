import { describe, expect, it } from "vitest";
import { checkPrompt } from "./check-prompt";
import type { Check } from "./check-view";

const id = "54a57dd7-0000-4000-8000-000000000000";
const deps: Check = {
  id, check: "deps_not_updated", state: "open", reason: null, source: "verified", name: "Dependency updates",
  title: "Nothing keeps your dependencies up to date", severity: "gap", why: "Old packages collect known security holes.",
  fix: { text: "Add a file named .github/dependabot.yml with these lines.", steps: ["version: 2", "updates:"], docUrl: "https://docs.github.com" },
  agent: { handoff: "pull_request", instructions: "Add .github/dependabot.yml. Open a pull request." },
  evidence: {}, firstOpenAt: null, fixedAt: null, dismissedAt: null, checkedAt: null,
};

describe("checkPrompt", () => {
  it("names the repo, has the agent take this finding, do the fix and report the pull request", () => {
    const p = checkPrompt({ name: "politiciansbyjev", repo: "n8peace/politiciansbyjev" }, deps);
    expect(p.split("\n")[0]).toBe("Spooky Particles found a gap in n8peace/politiciansbyjev: Nothing keeps your dependencies up to date.");
    expect(p).toContain(`next_finding tool with finding_id ${id}`);
    expect(p).toContain(`/api/v1/checks/${id}/take`);
    expect(p).toContain("version: 2\nupdates:");
    expect(p).toContain('"outcome":"pr_opened"');
    expect(p).toContain("Do not merge the pull request");
    expect(p).not.toMatch(/sp_[A-Za-z0-9]/);
  });

  it("asks for steps for the person when the fix is a setting only they can change", () => {
    const p = checkPrompt({ name: "site" }, { ...deps, agent: { handoff: "person", instructions: "Give your person the exact setting steps." } });
    expect(p).toContain("gap in site:");
    expect(p).toContain('"outcome":"told_person"');
    expect(p).not.toContain("pull request link");
  });
});

describe("canHandOff", () => {
  const h = { attempts: 0, max: 3, capped: false, inProgress: false, last: null };
  it("offers the agent words only when Spooky would let an agent take it", async () => {
    const { canHandOff } = await import("./check-view");
    expect(canHandOff({ ...deps, handoff: h }, false)).toBe(true);
    expect(canHandOff({ ...deps, handoff: h }, true)).toBe(false);
    expect(canHandOff({ ...deps, handoff: { ...h, capped: true } }, false)).toBe(false);
    expect(canHandOff({ ...deps, handoff: { ...h, inProgress: true } }, false)).toBe(false);
    expect(canHandOff({ ...deps, id: null }, false)).toBe(false);
  });
});
