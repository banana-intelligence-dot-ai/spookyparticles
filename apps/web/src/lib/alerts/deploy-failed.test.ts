import { describe, expect, it } from "vitest";
import { alertKey, optOutToken, optOutTokenValid, renderDeployFailed, type DeployFailure } from "./deploy-failed";

const ENV = { SP_MASTER_KEY: Buffer.alloc(32, 7).toString("base64") };

const failure: DeployFailure = {
  deploymentId: "dpl_1",
  project: "n8peace/plainballot",
  environment: "production",
  host: "Vercel",
  at: "2026-11-04T10:00:00.000Z",
  cause: "Type error: Property 'foo' does not exist on type 'Bar'.",
  logTail: Array.from({ length: 40 }, (_, i) => `line ${i + 1}`),
  inspectorUrl: "https://vercel.com/n8peaces-projects/plainballot/dpl_1",
  url: "https://plainballot-abc.vercel.app",
};

describe("renderDeployFailed", () => {
  it("names the project, the host and the cause, keeps 15 log lines, and links out and to opt out", () => {
    const r = renderDeployFailed(failure, { todayUrl: "https://spookyparticles.com/app", unsubscribeUrl: "https://spookyparticles.com/api/alerts/opt-out?x" });
    expect(r.subject).toBe("plainballot: production deploy failed on Vercel");
    expect(r.text).toContain("Type error: Property 'foo'");
    expect(r.text).toContain("Last 15 lines of the log");
    expect(r.text).toContain("line 40");
    expect(r.text).not.toContain("line 25\n");
    expect(r.text).toContain("Nothing was changed, redeployed or rolled back.");
    expect(r.html).toContain("Stop these emails");
    expect(r.html).toContain("&#39;foo&#39;");
    expect(r.html).not.toContain("<script");
  });
  it("says so when there is no cause and no log", () => {
    const r = renderDeployFailed({ ...failure, cause: null, logTail: [], inspectorUrl: null }, { todayUrl: "t", unsubscribeUrl: "u" });
    expect(r.text).toContain("did not name a cause");
    expect(r.text).toContain("No log lines were available.");
  });
});

describe("opt-out token", () => {
  it("is stable per user and kind, and rejects another user's token", () => {
    const t = optOutToken("user_a", "deploy_failed", ENV);
    expect(optOutTokenValid("user_a", "deploy_failed", t, ENV)).toBe(true);
    expect(optOutTokenValid("user_b", "deploy_failed", t, ENV)).toBe(false);
    expect(optOutTokenValid("user_a", "deploy_failed", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), ENV)).toBe(false);
  });
  it("keys one alert per deployment", () => {
    expect(alertKey({ deploymentId: "dpl_9" })).toBe("deploy_failed:dpl_9");
  });
});
