import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import { ALARM_CLEARED, ALARM_SET, alarmFor, alarmInput, alarmKey, alarmLine, alarmsFrom, normCheck } from "./alarms";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 16, 12, minute));
const event = (name: string, project: string, check: string, minute: number, note: string | null = null) => ({
  name,
  properties: { key: alarmKey(project, check), project, check, note },
  createdAt: at(minute),
});

describe("normCheck", () => {
  it("matches workflow paths, file names and display-name case", () => {
    expect(normCheck(" .github/workflows/visual-coverage.yml ")).toBe("visual-coverage");
    expect(normCheck(".github\\workflows\\visual-coverage.yaml")).toBe("visual-coverage");
    expect(normCheck("Watch visual coverage")).toBe("watch visual coverage");
  });
});

describe("alarmsFrom", () => {
  it("keeps alarms whose newest event sets them, newest first", () => {
    const rows = [
      event(ALARM_SET, "me/first", "coverage.yml", 1),
      event(ALARM_SET, "me/cleared", "daily.yml", 2),
      event(ALARM_CLEARED, "me/cleared", "daily.yml", 3),
      event(ALARM_SET, "me/latest", "watch.yml", 4, "30% floor"),
    ];
    expect(alarmsFrom(rows).map((alarm) => alarm.project)).toEqual(["me/latest", "me/first"]);
  });
});

describe("alarmFor", () => {
  const alarms = alarmsFrom([
    event(ALARM_SET, "owner/repo", ".github/workflows/visual-coverage.yml", 1),
    event(ALARM_SET, "owner/other", "Watch visual coverage", 2),
  ]);

  it("matches a path or display name on the same project only", () => {
    expect(alarmFor(alarms, "repo", ["visual-coverage"])?.project).toBe("owner/repo");
    expect(alarmFor(alarms, "OWNER/OTHER", ["watch VISUAL coverage"])?.project).toBe("owner/other");
    expect(alarmFor(alarms, "owner/elsewhere", ["visual-coverage"])).toBeNull();
  });
});

describe("alarmInput", () => {
  it("trims valid input and limits the optional note", () => {
    expect(alarmInput({ project: " owner/repo ", check: " Watch coverage ", note: " 30% floor " })).toEqual({ project: "owner/repo", check: "Watch coverage", note: "30% floor" });
    expect(alarmInput({ project: "owner/repo", check: "watch", note: "x".repeat(201) }).note).toHaveLength(200);
  });

  it.each([
    [{ check: "watch" }, "project_required"],
    [{ project: "owner/repo" }, "check_required"],
    [{ project: "x".repeat(121), check: "watch" }, "project_required"],
    [{ project: "owner/repo", check: "x".repeat(121) }, "check_required"],
  ])("rejects missing or long fields", (input, code) => {
    try {
      alarmInput(input);
      throw new Error("expected alarmInput to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 400, code });
    }
  });
});

describe("alarmLine", () => {
  it("names the measured check and optional note", () => {
    expect(alarmLine({ check: "Watch visual coverage", note: "30% floor" })).toBe("Alarm about the real world, not a broken check: Watch visual coverage (30% floor).");
    expect(alarmLine({ check: "Watch visual coverage", note: null })).toBe("Alarm about the real world, not a broken check: Watch visual coverage.");
  });
});
