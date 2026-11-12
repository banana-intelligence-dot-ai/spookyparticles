import { describe, expect, it } from "vitest";
import { runErrorMessage } from "./run-error";

describe("runErrorMessage", () => {
  it("reads the message off a foreign-realm error object", () => {
    expect(runErrorMessage({ name: "FatalError", message: "Google access expired" }, "backfill failed")).toBe("Google access expired");
  });
  it("falls back only when there is nothing to say", () => {
    expect(runErrorMessage(undefined, "backfill failed")).toBe("backfill failed");
    expect(runErrorMessage({ message: "" }, "backfill failed")).toBe("backfill failed");
    expect(runErrorMessage("rate limited", "x")).toBe("rate limited");
  });
  it("keeps query parameters out and names the missing column", () => {
    const msg =
      'Step "step//./src/workflows/steps/gmail//fetchAndStore" failed after 8 retries: Failed query: insert into "messages" ("id") values ($1)\nparams: secret subject line\ncause: column "tier1_type" of relation "messages" does not exist';
    const out = runErrorMessage({ message: msg }, "backfill failed");
    expect(out).toBe("database write failed: messages.tier1_type missing (fetchAndStore, 8 retries)");
    expect(out).not.toContain("secret");
  });
  it("caps the length", () => {
    expect(runErrorMessage(new Error("x".repeat(500)), "f")).toHaveLength(160);
  });
});
