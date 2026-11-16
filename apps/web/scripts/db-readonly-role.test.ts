import { describe, expect, it } from "vitest";
import { readable } from "./db-readonly-role";

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
