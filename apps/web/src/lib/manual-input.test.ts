import { describe, expect, it } from "vitest";
import { clampDays, summarizeManual } from "./manual-input";

describe("manual input count", () => {
  it("splits steps by who took them and lists what to automate next", () => {
    const r = summarizeManual([
      { actor: "user:u1", action: "checkin.updated" },
      { actor: "user:u1", action: "checkin.updated" },
      { actor: "user:u1", action: "alert_channel.added" },
      { actor: "user:u1", action: "device.approved" },
      { actor: "api_key:k1", action: "check.reported" },
      { actor: "system:pager", action: "pager.github_dispatched" },
    ], 7);
    expect(r).toMatchObject({ humanSteps: 4, avoidableHumanSteps: 3, agentSteps: 1, spookySteps: 1, humanShare: 0.667, setupHumanSteps: 3 });
    expect(r.automateNext).toEqual([{ action: "checkin.updated", count: 2 }, { action: "alert_channel.added", count: 1 }]);
  });
  it("has no share when nothing happened", () => {
    expect(summarizeManual([], 7).humanShare).toBeNull();
  });
  it("keeps the window between 1 and 90 days", () => {
    expect(clampDays("400")).toBe(90);
    expect(clampDays(0)).toBe(1);
    expect(clampDays("x")).toBe(7);
    expect(clampDays(undefined)).toBe(7);
  });
});
