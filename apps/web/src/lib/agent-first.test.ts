import { describe, expect, it } from "vitest";
import { heldOutcome, listensFor } from "./agent-first";

describe("listensFor", () => {
  it("matches a project read by its repo or short name", () => {
    expect(listensFor(["daystart"], "n8peace/daystart")).toBe(true);
    expect(listensFor(["n8peace/daystart"], "n8peace/daystart")).toBe(true);
  });
  it("is false with no project, or nobody reading it", () => {
    expect(listensFor(["daystart"], null)).toBe(false);
    expect(listensFor(["billing"], "n8peace/daystart")).toBe(false);
    expect(listensFor([], "n8peace/daystart")).toBe(false);
  });
});

describe("heldOutcome", () => {
  it("emails the person only while the job is still broken", () => {
    expect(heldOutcome("down")).toBe("email");
    expect(heldOutcome("late")).toBe("email");
    expect(heldOutcome("up")).toBe("resolved");
    expect(heldOutcome("retired")).toBe("resolved");
    expect(heldOutcome(null)).toBe("resolved");
  });
});
