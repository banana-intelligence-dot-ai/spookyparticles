import { describe, expect, it } from "vitest";
import { pickProject } from "@/lib/providers/vercel";
import { cronRule, depsRule, keepPriorAnswer, KNOWN_ANSWER_HOLD_MS, previewRule, publicNameRule, sensitiveRule, transition } from "./rules";

const raw = { id: "p", name: "p", ssoProtection: null, passwordProtection: null, trustedIps: null, env: [] };
const project = (extra: Record<string, unknown> = {}) => pickProject({ ...raw, ...extra });
const env = (key: string, type = "encrypted", target: string | string[] = "production") => ({ key, type, target, value: "MUST_NEVER_LEAK_948201" });

describe("project check rules", () => {
  it("judges protection, including an unreadable setting", () => {
    expect(previewRule(project()).state).toBe("open");
    expect(previewRule(project({ ssoProtection: { deploymentType: "all" } })).state).toBe("ok");
    // Vercel's four documented values all cover preview links; Standard Protection is the default on new projects.
    for (const deploymentType of ["all_except_custom_domains", "prod_deployment_urls_and_all_previews", "all", "preview"]) expect(previewRule(project({ ssoProtection: { deploymentType } })).state).toBe("ok");
    expect(previewRule(project({ ssoProtection: { deploymentType: "something_new" } }))).toMatchObject({ state: "unknown", reason: "setting_not_recognized" });
    expect(previewRule(project({ trustedIps: ["1.1.1.1"] })).state).toBe("ok");
    expect(previewRule(pickProject({ id: "p", name: "p" }))).toMatchObject({ state: "unknown", reason: "needs_read_token" });
  });
  it("keeps env names and types but never values", () => {
    const p = project({ env: [env("DATABASE_URL", "plain"), env("TOKEN", "encrypted", ["preview"]), env("NEXT_PUBLIC_API_KEY", "plain"), env("OTHER", "sensitive")] });
    expect(JSON.stringify(p)).not.toContain("MUST_NEVER_LEAK_948201");
    expect(p.env).toEqual([{ key: "DATABASE_URL", targets: ["production"], type: "plain" }, { key: "TOKEN", targets: ["preview"], type: "encrypted" }, { key: "NEXT_PUBLIC_API_KEY", targets: ["production"], type: "plain" }, { key: "OTHER", targets: ["production"], type: "sensitive" }]);
    expect(sensitiveRule(p)).toMatchObject({ state: "open", evidence: { names: ["DATABASE_URL", "TOKEN"], plain: 1, readable: 1 } });
    expect(sensitiveRule(project({ env: [env("TOKEN", "sensitive"), env("NEXT_PUBLIC_TOKEN", "plain"), env("PASSWORD", "encrypted", "development")] })).state).toBe("ok");
    expect(sensitiveRule(project({ env: undefined }))).toMatchObject({ state: "unknown", reason: "needs_read_token" });
    // We had the list, so the reason is never "needs a token": it names what we could not read.
    expect(sensitiveRule(project({ env: [{ key: "DATABASE_URL", type: "plain" }] }))).toMatchObject({ state: "unknown", reason: "setting_not_recognized", evidence: { types: [], noTarget: 1 } });
    expect(sensitiveRule(project({ env: [env("API_KEY", "vault")] }))).toMatchObject({ state: "unknown", reason: "setting_not_recognized", evidence: { types: ["vault"], noTarget: 0 } });
    expect(sensitiveRule(project({ env: [env("TOKEN", "sensitive"), env("API_KEY", "sensitive", ["preview"])] }))).toMatchObject({ state: "ok", evidence: { checked: 2 } });
    expect(sensitiveRule(project({ env: [env("SITE_NAME", "plain")] }))).toMatchObject({ state: "ok", evidence: { checked: 0 } });
  });
  it("finds suspect public names and skips unreadable names", () => {
    expect(publicNameRule(project({ env: [env("NEXT_PUBLIC_SERVICE_ROLE_KEY")] }))).toMatchObject({ state: "open", evidence: { kind: "name", name: "NEXT_PUBLIC_SERVICE_ROLE_KEY" } });
    expect(publicNameRule(project({ env: [env("NEXT_PUBLIC_API_KEY")] }))).toBeNull();
    expect(publicNameRule(project({ env: undefined }))).toBeNull();
  });
  it("checks scheduled routes without calling them", () => {
    const schedules = { daily: { path: "/api/daily", schedule: "0 0 * * *" } };
    expect(cronRule(project())).toMatchObject({ state: "not_applicable", reason: "no_schedules" });
    expect(cronRule(project({ schedules, env: undefined }))).toMatchObject({ state: "unknown", reason: "needs_read_token" });
    expect(cronRule(project({ schedules }))).toMatchObject({ state: "open", evidence: { paths: ["/api/daily"] } });
    expect(cronRule(project({ schedules, env: [env("CRON_SECRET", "sensitive", "production")] })).state).toBe("ok");
    expect(cronRule(project({ schedules, env: [env("CRON_SECRET", "sensitive", "preview")] })).state).toBe("open");
  });
  it("covers every dependency branch", () => {
    expect(depsRule({ linked: false })).toMatchObject({ state: "not_applicable", reason: "no_repo" });
    expect(depsRule({ linked: true })).toMatchObject({ state: "unknown", reason: "needs_github" });
    expect(depsRule({ linked: true, covered: true, private: true })).toMatchObject({ state: "unknown", reason: "private_repo" });
    expect(depsRule({ linked: true, covered: true, failed: true })).toMatchObject({ state: "unknown" });
    expect(depsRule({ linked: true, covered: true, files: [] }).state).toBe("open");
    expect(depsRule({ linked: true, covered: true, files: [".github/dependabot.yml"] }).state).toBe("ok");
  });
});

it("records first open and fix, reopens with a new start, and preserves dates on unknown", () => {
  const a = new Date("2026-01-01"), b = new Date("2026-01-02"), c = new Date("2026-01-03");
  expect(transition(null, "open", a)).toEqual({ firstOpenAt: a, fixedAt: null });
  expect(transition({ state: "unknown", firstOpenAt: null, fixedAt: null }, "open", a)).toEqual({ firstOpenAt: a, fixedAt: null });
  expect(transition({ state: "open", firstOpenAt: a, fixedAt: null }, "ok", b)).toEqual({ firstOpenAt: a, fixedAt: b });
  expect(transition({ state: "ok", firstOpenAt: a, fixedAt: b }, "unknown", c)).toEqual({ firstOpenAt: a, fixedAt: b });
  expect(transition({ state: "unknown", firstOpenAt: a, fixedAt: null }, "ok", c)).toEqual({ firstOpenAt: a, fixedAt: c });
  expect(transition({ state: "unknown", firstOpenAt: a, fixedAt: b }, "open", c)).toEqual({ firstOpenAt: c, fixedAt: null });
  expect(transition({ state: "ok", firstOpenAt: a, fixedAt: b }, "open", c)).toEqual({ firstOpenAt: c, fixedAt: null });
});

it("carries decisions between sync steps, not the list of variable names", async () => {
  const { slimForSync } = await import("./rules");
  const slim = slimForSync(pickProject({ id: "p", name: "p", ssoProtection: { deploymentType: "all_except_custom_domains" }, env: [
    { key: "HARMLESS_SETTING_NAME", target: ["production"], type: "plain", value: "blue" },
    { key: "STRIPE_SECRET_KEY", target: ["production"], type: "encrypted", value: "sk_live_never" },
  ] }));
  const text = JSON.stringify(slim);
  expect(text).not.toContain("HARMLESS_SETTING_NAME");
  expect(text).not.toContain("sk_live_never");
  expect(slim).not.toHaveProperty("env");
  expect(slim).not.toHaveProperty("protection");
  expect(slim.checks?.previews.state).toBe("ok");
  expect(slim.services).toEqual(["stripe"]);
  expect(slim.checks?.sensitive).toMatchObject({ state: "open", evidence: { names: ["STRIPE_SECRET_KEY"] } });
  expect(slimForSync(pickProject({ id: "p", name: "p" })).checks).toBeUndefined();
  expect(slimForSync(pickProject({ id: "p", name: "p" })).services).toBeUndefined();
});

describe("keepPriorAnswer", () => {
  const now = new Date("2026-11-11T08:00:00Z");
  const cannotRead = { state: "unknown" as const, reason: "needs_read_token", evidence: {} };
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it("keeps a fresh real answer when another connection cannot read the setting", () => {
    expect(keepPriorAnswer({ state: "ok", checkedAt: ago(60_000) }, cannotRead, now)).toBe(true);
    expect(keepPriorAnswer({ state: "open", checkedAt: ago(60_000) }, cannotRead, now)).toBe(true);
  });
  it("lets the unknown through when the real answer is stale, absent or itself unknown", () => {
    expect(keepPriorAnswer({ state: "ok", checkedAt: ago(KNOWN_ANSWER_HOLD_MS + 1) }, cannotRead, now)).toBe(false);
    expect(keepPriorAnswer(null, cannotRead, now)).toBe(false);
    expect(keepPriorAnswer({ state: "unknown", checkedAt: ago(1) }, cannotRead, now)).toBe(false);
    expect(keepPriorAnswer({ state: "ok", checkedAt: null }, cannotRead, now)).toBe(false);
  });
  it("never blocks a real answer or another kind of unknown", () => {
    expect(keepPriorAnswer({ state: "ok", checkedAt: ago(1) }, { state: "open", reason: null, evidence: {} }, now)).toBe(false);
    expect(keepPriorAnswer({ state: "ok", checkedAt: ago(1) }, { state: "unknown", reason: "setting_not_recognized", evidence: {} }, now)).toBe(false);
  });
});
