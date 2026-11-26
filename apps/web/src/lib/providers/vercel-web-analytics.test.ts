import { afterEach, describe, expect, it, vi } from "vitest";
import { countWebAnalytics, pickProject, webAnalyticsOn } from "./vercel";

const team = { kind: "team" as const, id: "team_1", slug: "team", name: "Team" };

describe("webAnalyticsOn", () => {
  it("is on only when enabled and not disabled since", () => {
    expect(webAnalyticsOn(undefined)).toBe(false);
    expect(webAnalyticsOn({ id: "x" })).toBe(false);
    expect(webAnalyticsOn({ enabledAt: 10 })).toBe(true);
    expect(webAnalyticsOn({ enabledAt: 10, disabledAt: 20 })).toBe(false);
    expect(webAnalyticsOn({ enabledAt: 30, disabledAt: 20 })).toBe(true);
    expect(pickProject({ id: "prj_1", name: "site", webAnalytics: { enabledAt: 1 } }).webAnalytics).toBe(true);
  });
});

describe("countWebAnalytics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads one UTC day and the week with GETs only", async () => {
    const calls: { url: URL; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL, init: RequestInit) => {
      const u = new URL(url);
      calls.push({ url: u, init });
      const body = u.pathname.endsWith("/events/count") ? { data: { visitors: 3, count: 7 } }
        : u.searchParams.get("since") === "2026-11-12" ? { data: { visitors: 40, pageviews: 90 } } : { data: { visitors: 5, pageviews: 6 } };
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const got = await countWebAnalytics("token", team, "prj_1", "2026-11-18", "2026-11-12");
    expect(got).toEqual({ ok: true, counts: { visitors: 5, pageviews: 6, clicks: 7, weekVisitors: 40 } });
    expect(calls).toHaveLength(3);
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ teamId: "team_1", projectId: "prj_1", since: "2026-11-18", until: "2026-11-18" });
    expect(calls[1].url.searchParams.get("filter")).toBe("eventName eq 'outbound_click'");
    expect(calls.every((c) => c.init.method === "GET")).toBe(true);
  });

  it("names a refusal as not readable, and anything else as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    expect(await countWebAnalytics("token", team, "prj_1", "2026-11-18", "2026-11-12")).toEqual({ ok: false, reason: "not_readable", status: 403 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { visitors: "many" } }), { status: 200 })));
    expect(await countWebAnalytics("token", team, "prj_1", "2026-11-18", "2026-11-12")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses a malformed day before any request", async () => {
    await expect(countWebAnalytics("token", team, "prj_1", "2026-11-18&x=1", "2026-11-12")).rejects.toThrow("invalid day");
  });
});
