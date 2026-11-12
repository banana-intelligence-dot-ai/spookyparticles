import { expect, it } from "vitest";
import { expirationAlertKey, expirationAlertText } from "./expiration";

it("keys each node, date and threshold independently", () => {
  const item = { kind: "domain" as const, name: "example.com", date: "2027-01-01", daysLeft: 7 };
  expect(expirationAlertKey(item, 7, "node-a")).toBe("expiration:domain:node-a:2027-01-01:7");
  expect(expirationAlertKey(item, 7, "node-a")).not.toBe(expirationAlertKey(item, 1, "node-a"));
  expect(expirationAlertKey(item, 7, "node-a")).not.toBe(expirationAlertKey(item, 7, "node-b"));
});

it("names tracked keys without including their value", () => {
  expect(expirationAlertText({ kind: "api_key", provider: "Anthropic", name: "news-factory", hint: "a1b2", date: "2027-08-19", daysLeft: 7 }))
    .toBe("Anthropic key news-factory (…a1b2) expires in 7 days, on 2027-08-19.");
});
