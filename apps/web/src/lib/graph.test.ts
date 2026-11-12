import { describe, expect, it } from "vitest";
import { assertNoSecretValues } from "./graph";

describe("assertNoSecretValues", () => {
  it("allows names and urls", () => {
    expect(() => assertNoSecretValues({ name: "DATABASE_URL", url: "https://x.vercel.app", env_var_names: ["A"] })).not.toThrow();
  });
  it("rejects keys that would hold secret values, including nested", () => {
    expect(() => assertNoSecretValues({ value: "abc" })).toThrow();
    expect(() => assertNoSecretValues({ access_token: "abc" })).toThrow();
    expect(() => assertNoSecretValues({ env: { DATABASE_URL: { value: "postgres://" } } })).toThrow();
  });
});
