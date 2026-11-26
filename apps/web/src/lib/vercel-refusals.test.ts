import { describe, expect, it } from "vitest";
import { REFUSAL_TTL_MS, isFreshRefusal } from "./vercel-refusals";

describe("isFreshRefusal", () => {
  const now = Date.parse("2026-11-25T12:00:00.000Z");

  it("keeps a refusal fresh for less than 24 hours", () => {
    expect(isFreshRefusal(new Date(now - REFUSAL_TTL_MS + 1).toISOString(), now)).toBe(true);
    expect(isFreshRefusal(new Date(now - REFUSAL_TTL_MS).toISOString(), now)).toBe(false);
  });

  it("rejects missing, invalid, and future timestamps", () => {
    expect(isFreshRefusal(null, now)).toBe(false);
    expect(isFreshRefusal("not-a-date", now)).toBe(false);
    expect(isFreshRefusal(new Date(now + 1).toISOString(), now)).toBe(false);
  });
});
