import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { trackedExpirationInput } from "./tracked";

const valid = { kind: "api_key", name: "news-factory", provider: "Anthropic", hint: "a1b2", project: "news", expiresOn: "2027-08-19" };

describe("tracked expiration validation", () => {
  it("keeps labels and a short hint, never a secret value", () => {
    expect(trackedExpirationInput(valid)).toEqual(valid);
    for (const name of ["sk-ant-api03-secretvalue123456", "ghp_1234567890abcdefghij", "eyJabcdefgh.eyJabcdefgh.abcdefghij"]) {
      expect(() => trackedExpirationInput({ ...valid, name })).toThrow(ApiError);
    }
  });

  it("accepts env-style names and refuses random tokens", () => {
    for (const name of ["STRIPE_SECRET_KEY_PRODUCTION_2026", "OpenAI prod key 2026", "vercel-token-ci-main-v2"]) {
      expect(trackedExpirationInput({ ...valid, name }).name).toBe(name);
    }
    for (const name of ["prod a8Fk2Lq9Zx7Bv3Nm5Ty1Wp", "x9K2mQ7vL4pR8tN3bW6zY1cF"]) {
      expect(() => trackedExpirationInput({ ...valid, name })).toThrow(/looks like a secret/);
    }
  });

  it("refuses hints longer than six characters", () => {
    expect(() => trackedExpirationInput({ ...valid, hint: "abcdefg" })).toThrowError(/up to 6/);
  });

  it("refuses invalid and out-of-range dates", () => {
    for (const expiresOn of ["2027-02-29", "1999-12-31", "2101-01-01", "tomorrow"]) {
      expect(() => trackedExpirationInput({ ...valid, expiresOn })).toThrow(ApiError);
    }
  });
});
