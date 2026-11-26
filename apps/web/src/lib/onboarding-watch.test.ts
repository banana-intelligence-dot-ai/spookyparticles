import { describe, expect, it } from "vitest";
import { onboardingVerdict } from "./onboarding-watch";

describe("onboarding verdict", () => {
  it("is ok when every new account has a check-in that pinged, including none at all", () => {
    expect(onboardingVerdict([])).toEqual({ ok: true, note: "0 new accounts, all reached a first check-in" });
    expect(onboardingVerdict([{ keys: 1, jobs: 2, pinged: 1 }]).ok).toBe(true);
  });
  it("names where each stuck account stopped, with counts only", () => {
    const v = onboardingVerdict([{ keys: 0, jobs: 0, pinged: 0 }, { keys: 2, jobs: 0, pinged: 0 }, { keys: 1, jobs: 1, pinged: 0 }, { keys: 1, jobs: 3, pinged: 2 }]);
    expect(v.ok).toBe(false);
    expect(v.note).toBe("3 of 4 new accounts stuck before a first check-in: 1 signed in only, 1 made a key but no job, 1 made a job that never pinged. Station: .claude/skills/onboarding");
  });
});
