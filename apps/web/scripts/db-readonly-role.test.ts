import { describe, expect, it } from "vitest";
import { readable, roleSteps, runStep } from "./db-readonly-role";

describe("read-only agent login: what it may read", () => {
  it("hides whole tables with sessions, sign-in codes, mail and card data", () => {
    for (const t of ["session", "verification", "messages", "receipts"]) expect(readable(t, "id")).toBe(false);
  });
  it("hides named secret columns", () => {
    expect(readable("account", "password")).toBe(false);
    expect(readable("checkin_jobs", "token")).toBe(false);
    expect(readable("checkin_jobs", "probe")).toBe(false);
    expect(readable("alert_channels", "encrypted_target")).toBe(false);
    expect(readable("api_keys", "hashed_key")).toBe(false);
  });
  it("hides a new column that looks like a secret even if nobody listed it", () => {
    expect(readable("forum_posts", "webhook_secret")).toBe(false);
    expect(readable("anything", "github_token")).toBe(false);
  });
  it("lets ordinary columns through", () => {
    expect(readable("checkin_jobs", "status")).toBe(true);
    expect(readable("user", "id")).toBe(true);
    expect(readable("audit_log", "action")).toBe(true);
  });
});

describe("read-only agent login: setup steps", () => {
  it("never names a role attribute Neon's owner may not change (needs superuser or that attribute)", () => {
    for (const [exists, pw] of [[false, "ab12"], [true, "ab12"], [true, null]] as const)
      for (const s of roleSteps(exists, pw))
        expect(s.sql).not.toMatch(/\b(NO)?(SUPERUSER|REPLICATION|CREATEDB|CREATEROLE|BYPASSRLS|INHERIT)\b/i);
  });
  it("creates the login only when missing, and changes the password only when asked", () => {
    expect(roleSteps(false, "ab12")[0].name).toBe("create the login");
    expect(roleSteps(true, "ab12")[0].name).toBe("set a new password");
    expect(roleSteps(true, null).map((s) => s.name)).not.toContain("set a new password");
  });
  it("a failure names the step and never shows the password or the connection string", async () => {
    const boom = async () => {
      throw new Error("permission denied for 'ab12cd' at postgresql://u:p@host/db");
    };
    const err = await runStep(boom, { name: "set read-only default", sql: "alter role x password 'ab12cd'" }, "ab12cd").then(() => new Error("no error"), (e: Error) => e);
    expect(err.message).toMatch(/^failed at: set read-only default/);
    expect(err.message).not.toMatch(/ab12cd|postgresql:|alter role/);
  });
});
