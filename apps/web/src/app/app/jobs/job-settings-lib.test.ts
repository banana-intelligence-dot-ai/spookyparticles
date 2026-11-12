import { describe, expect, it } from "vitest";
import { buildSettingsInput, buildSettingsPatch, describeProbeRule, emptyJobSettings, settingsFromJob, type StoredJobSettings } from "./job-settings-lib";

const original: StoredJobSettings = {
  owner: "email agent",
  maxRunMinutes: 30,
  minCount: 1,
  schedule: "35 7 * * 1-5",
  timeZone: "America/New_York",
  probe: { url: "https://example.com/outcome", expect: [{ path: "sentCount", op: "gte", value: 1 }] },
};

describe("job settings PATCH diff", () => {
  it("sends only changed fields and null for cleared fields", () => {
    const value = settingsFromJob(original);
    value.owner = "";
    value.maxRunMinutes = "";
    expect(buildSettingsPatch(original, value, true)).toEqual({ owner: null, maxRunMinutes: null });
  });

  it("does not send manual-only fields for a Vercel job", () => {
    const value = settingsFromJob(original);
    value.schedule = "0 8 * * *";
    value.owner = "new owner";
    expect(buildSettingsPatch(original, value, false)).toEqual({ owner: "new owner" });
  });
});

describe("probe rule descriptions", () => {
  it("describes today's date in plain words", () => {
    expect(describeProbeRule({ path: "date", op: "eq", value: "$today" })).toBe("date is today");
  });

  it("describes gte as at least", () => {
    expect(describeProbeRule({ path: "sentCount", op: "gte", value: 1 })).toBe("sentCount at least 1");
  });
});

describe("a result check with no schedule", () => {
  it("is still sent, so the API can say a schedule is required", () => {
    const value = emptyJobSettings("UTC");
    value.probeUrl = "https://example.com/health";
    value.rules = [{ path: "ok", op: "eq", value: "true" }];
    expect(buildSettingsInput(value)).toEqual({ probe: { url: "https://example.com/health", expect: [{ path: "ok", op: "eq", value: true }] } });
  });
});
