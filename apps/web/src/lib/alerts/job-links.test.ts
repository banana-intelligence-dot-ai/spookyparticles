import { describe, expect, it } from "vitest";
import { retireToken, retireTokenValid } from "./job-links";
import { optOutToken } from "./deploy-failed";

const ENV = { SP_MASTER_KEY: Buffer.alloc(32, 7).toString("base64") };

describe("retire link token", () => {
  it("binds one user to one job", () => {
    const t = retireToken("user_a", "job_1", ENV);
    expect(retireTokenValid("user_a", "job_1", t, ENV)).toBe(true);
    expect(retireTokenValid("user_b", "job_1", t, ENV)).toBe(false);
    expect(retireTokenValid("user_a", "job_2", t, ENV)).toBe(false);
    expect(retireTokenValid("user_a", "job_1", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), ENV)).toBe(false);
    expect(retireTokenValid("user_a", "job_1", "", ENV)).toBe(false);
  });

  it("uses its own key, so an opt-out token never retires a job", () => {
    expect(retireToken("user_a", "deploy_failed", ENV)).not.toBe(optOutToken("user_a", "deploy_failed", ENV));
  });
});
