import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./net-safety";

describe("public address classification", () => {
  it("accepts public IPv4 and IPv6", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("refuses private, loopback, link local, reserved, and mapped addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.2", "172.16.0.1", "192.168.1.1", "169.254.1.2", "100.64.0.1", "0.1.2.3", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1", "not-an-ip"]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });
});
