import { expect, it } from "vitest";
import { linkReturnTo, safeReturnTo, signInErrorMessage } from "./sign-in-notice";

it("explains a disabled social sign-up", () => {
  expect(signInErrorMessage("signup_disabled")).toBe(
    "No account uses that sign-in. New accounts start with Continue with Vercel.",
  );
  expect(signInErrorMessage("invalid_code")).toBeNull();
  expect(signInErrorMessage(null)).toBeNull();
});

it("sends /link back to itself with only a code-shaped value", () => {
  expect(linkReturnTo("bcdf-ghjk")).toBe("/link?code=bcdf-ghjk");
  expect(linkReturnTo(null)).toBe("/link");
  expect(linkReturnTo("x&returnTo=//evil.example")).toBe("/link");
});

it("allows only known return paths after sign-in", () => {
  expect(safeReturnTo("/api/connect/vercel/callback")).toBe("/api/connect/vercel/callback");
  expect(safeReturnTo("/link")).toBe("/link");
  expect(safeReturnTo("/link?code=BCDF-GHJK")).toBe("/link?code=BCDF-GHJK");
  expect(safeReturnTo("//evil.example")).toBeNull();
  expect(safeReturnTo("/link?code=x#//evil")).toBeNull();
  expect(safeReturnTo("https://evil.example/link")).toBeNull();
  expect(safeReturnTo(null)).toBeNull();
});
