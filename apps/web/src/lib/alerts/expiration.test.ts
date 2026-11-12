import { expect, it } from "vitest";
import { expirationAlertKey } from "./expiration";

it("keys each node, date and threshold independently", () => {
  const item = { kind: "domain" as const, name: "example.com", date: "2027-01-01", daysLeft: 7 };
  expect(expirationAlertKey(item, 7, "node-a")).toBe("expiration:domain:node-a:2027-01-01:7");
  expect(expirationAlertKey(item, 7, "node-a")).not.toBe(expirationAlertKey(item, 1, "node-a"));
  expect(expirationAlertKey(item, 7, "node-a")).not.toBe(expirationAlertKey(item, 7, "node-b"));
});
