import { expect, it } from "vitest";
import { registrationAttributes } from "./domains";

it("preserves known dates when the account domain read is refused", () => {
  expect(registrationAttributes({ expires_at: "2027-01-01T00:00:00.000Z", auto_renew: true, registration: "vercel" }, null, "example.com"))
    .toEqual({ expires_at: "2027-01-01T00:00:00.000Z", auto_renew: true, registration: "vercel" });
});

it("clears an old date when a successful account read says registered elsewhere", () => {
  expect(registrationAttributes({ expires_at: "2027-01-01T00:00:00.000Z" }, [{ name: "example.com", expiresAt: null, autoRenew: null, registeredHere: false }], "example.com"))
    .toEqual({ expires_at: null, auto_renew: null, registration: "elsewhere" });
});

it("does not call an unlisted domain registered elsewhere", () => {
  expect(registrationAttributes(undefined, [], "example.com").registration).toBeNull();
});
