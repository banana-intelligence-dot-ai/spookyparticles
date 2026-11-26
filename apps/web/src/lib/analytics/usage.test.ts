import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, FUNNEL, cleanArrival, cleanRef, mergeDailyStats } from "./usage";

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
    expect(CLIENT_EVENTS.has("setup_prompt_copied")).toBe(true);
    expect(CLIENT_EVENTS.has("setup_md_read")).toBe(false);
    expect(CLIENT_EVENTS.has("agent_signin_started")).toBe(false);
    expect(CLIENT_EVENTS.has("signed_up")).toBe(false);
    expect(CLIENT_EVENTS.has("consent_granted")).toBe(false);
    expect(CLIENT_EVENTS.has("landed")).toBe(true);
  });
});

describe("FUNNEL", () => {
  it("orders the agent path before the existing sign-in path", () => {
    expect(FUNNEL.slice(0, 5)).toEqual(["landed", "setup_prompt_copied", "setup_md_read", "agent_signin_started", "signin_clicked"]);
  });
});

describe("mergeDailyStats", () => {
  it("combines UTC start and approval counts with zeroes for missing days", () => {
    expect(
      mergeDailyStats(
        [
          { day: "2026-11-24", count: 5 },
          { day: "2026-11-25", count: 3 },
        ],
        [
          { day: "2026-11-23", count: 1 },
          { day: "2026-11-24", count: 2 },
        ],
      ),
    ).toEqual([
      { day: "2026-11-25", agent_signin_started: 3, device_approved: 0 },
      { day: "2026-11-24", agent_signin_started: 5, device_approved: 2 },
      { day: "2026-11-23", agent_signin_started: 0, device_approved: 1 },
    ]);
  });
});
