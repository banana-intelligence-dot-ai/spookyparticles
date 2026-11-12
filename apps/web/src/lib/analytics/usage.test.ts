import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, cleanArrival, cleanRef } from "./usage";

describe("cleanRef", () => {
  it("accepts valid link tags and rejects anything else", () => {
    expect(cleanRef("x-launch")).toBe("x-launch");
    expect(cleanRef(" HN ")).toBe("hn");
    expect(cleanRef("li-1104")).toBe("li-1104");
    expect(cleanRef("-bad")).toBeNull();
    expect(cleanRef("a")).toBeNull();
    expect(cleanRef("has space")).toBeNull();
    expect(cleanRef("<script>")).toBeNull();
    expect(cleanRef("x".repeat(41))).toBeNull();
    expect(cleanRef(undefined)).toBeNull();
  });
});

describe("cleanArrival", () => {
  it("keeps a clean path and tags, drops query strings and junk", () => {
    expect(cleanArrival({ ref: "hn", utm_source: "X-post", utm_campaign: "launch", path: "/how/apps" })).toEqual({ ref: "hn", utmSource: "x-post", utmCampaign: "launch", path: "/how/apps" });
    expect(cleanArrival({ path: "/app?token=abc" }).path).toBeNull();
    expect(cleanArrival({ path: "javascript:alert(1)" }).path).toBeNull();
    expect(cleanArrival({ ref: 42 }).ref).toBeNull();
  });
});

describe("CLIENT_EVENTS", () => {
  it("never lets the browser claim a server-side funnel step", () => {
    expect(CLIENT_EVENTS.has("signed_up")).toBe(false);
    expect(CLIENT_EVENTS.has("consent_granted")).toBe(false);
    expect(CLIENT_EVENTS.has("landed")).toBe(true);
  });
});
