import { describe, expect, it } from "vitest";
import { byCurrentStatus, jobDot } from "./run-history";

describe("jobDot", () => {
  it("is red only when the job is broken now", () => {
    expect(jobDot("down").tone).toBe("red");
    expect(jobDot("late").tone).toBe("amber");
    expect(jobDot("never_checked_in").tone).toBe("amber");
  });
  it("is green for a job that came back, whatever its past misses", () => {
    expect(jobDot("up").tone).toBe("accent");
  });
  it("is grey for paused, retired and new jobs", () => {
    expect(jobDot("paused").tone).toBe("grey");
    expect(jobDot("retired").tone).toBe("grey");
    expect(jobDot("new").tone).toBe("grey");
  });
});

describe("byCurrentStatus", () => {
  it("puts broken now first, then late, and keeps the rest in order", () => {
    const rows = [{ id: "a", status: "up" }, { id: "b", status: "down" }, { id: "c", status: "late" }, { id: "d", status: "up" }, { id: "e", status: "down" }];
    expect(byCurrentStatus(rows).map((r) => r.id)).toEqual(["b", "e", "c", "a", "d"]);
  });
});
