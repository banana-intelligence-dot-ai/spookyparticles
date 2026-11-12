import { describe, expect, it } from "vitest";
import { deliverTo, isRestrictedAddress, validateTarget } from "./channels";

describe("alert destinations", () => {
  it.each(["10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "100.127.255.255", "0.0.0.0", "::1", "::", "fc00::1", "fdff::1", "fe80::1", "febf::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:a00:1", "0:0:0:0:0:ffff:10.0.0.1"])("rejects %s", (address) => {
    expect(isRestrictedAddress(address)).toBe(true);
  });
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2001:4860:4860::8888", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (address) => {
    expect(isRestrictedAddress(address)).toBe(false);
  });
  it("requires a long topic and rejects unsafe webhook and ntfy hosts", () => {
    expect(validateTarget("ntfy", "short").ok).toBe(false);
    expect(validateTarget("ntfy", "A".repeat(20)).ok).toBe(true);
    expect(validateTarget("ntfy", "https://localhost/" + "A".repeat(24)).ok).toBe(false);
    expect(validateTarget("ntfy", "https://10.0.0.1/" + "A".repeat(24)).ok).toBe(false);
    expect(validateTarget("ntfy", "https://user:pass@example.com/" + "A".repeat(24)).ok).toBe(false);
    expect(validateTarget("ntfy", "https://example.com:8443/" + "A".repeat(24)).ok).toBe(false);
    expect(validateTarget("slack", "https://hooks.slack.com.evil.test/services/x").ok).toBe(false);
    expect(validateTarget("teams", "https://logic.azure.com.evil.test/x").ok).toBe(false);
    expect(validateTarget("teams", "https://prod-12.westus.logic.azure.com/x").ok).toBe(true);
  });
  it("refuses an unsafe saved address at send time without throwing", async () => {
    await expect(deliverTo("slack", "https://example.com/services/x", { subject: "Test", text: "Test" }))
      .resolves.toEqual({ ok: false, reason: "This address is no longer accepted. Remove it and add it again." });
  });
});
