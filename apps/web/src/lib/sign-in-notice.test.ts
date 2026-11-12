import { expect, it } from "vitest";
import { signInErrorMessage } from "./sign-in-notice";

it("explains a disabled social sign-up", () => {
  expect(signInErrorMessage("signup_disabled")).toBe(
    "No account uses that sign-in. New accounts start with Continue with Vercel.",
  );
  expect(signInErrorMessage("invalid_code")).toBeNull();
  expect(signInErrorMessage(null)).toBeNull();
});
