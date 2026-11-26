import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFUSAL_TTL_MS, WEB_ANALYTICS_REFUSED_AT } from "@/lib/vercel-refusals";
import { webAnalyticsNumbers, webAnalyticsRow } from "./web-analytics-numbers";

const mocks = vi.hoisted(() => ({
  projects: [] as Record<string, unknown>[],
  countWebAnalytics: vi.fn(),
  getAccessToken: vi.fn(),
  persistNodeRefusal: vi.fn(),
}));

const updateWhere = vi.fn();
const db = {
  select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: () => mocks.projects }) }) })),
  update: vi.fn(() => ({ set: () => ({ where: updateWhere }) })),
};

vi.mock("@/db", async (original) => ({ ...await original(), getDb: () => db }));
vi.mock("@/lib/connections", () => ({ getAccessToken: mocks.getAccessToken }));
vi.mock("@/lib/providers/vercel", async (original) => ({ ...await original(), countWebAnalytics: mocks.countWebAnalytics }));
vi.mock("@/lib/vercel-refusals", async (original) => ({ ...await original(), persistNodeRefusal: mocks.persistNodeRefusal }));

const now = Date.parse("2026-11-25T12:00:00.000Z");
const project = (refusedAt?: string) => ({
  id: "node_1",
  name: "my-site",
  externalKey: "vercel:project:prj_1",
  attributes: {
    connection_id: "connection_1",
    scope_id: "team_1",
    scope_kind: "team",
    web_analytics: true,
    ...(refusedAt ? { [WEB_ANALYTICS_REFUSED_AT]: refusedAt } : {}),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects = [project()];
  mocks.getAccessToken.mockResolvedValue("token");
});

describe("webAnalyticsRow", () => {
  it("leads with visitors by default and counts product clicks", () => {
    expect(webAnalyticsRow("my-site", "2026-11-19", { visitors: 5, pageviews: 6, clicks: 0, weekVisitors: 17 }))
      .toEqual({ app: "my-site", day: "2026-11-19", mainName: "visitors", mainValue: 5, week: 17, counts: { "product clicks": 0, "page views": 6 }, utcDay: true });
  });
  it("keeps neutral app names and preserves zero counts", () => {
    const row = webAnalyticsRow("my-docs", "2026-11-19", { visitors: 9, pageviews: 12, clicks: 0, weekVisitors: 40 });
    expect(row.mainName).toBe("visitors");
    expect(row.mainValue).toBe(9);
    expect(row.counts).toEqual({ "product clicks": 0, "page views": 12 });
  });
});

describe("webAnalyticsNumbers refusal", () => {
  it("persists a 404 refused read on the project", async () => {
    mocks.countWebAnalytics.mockResolvedValue({ ok: false, reason: "not_readable", status: 404 });

    expect(await webAnalyticsNumbers("user_1", now)).toEqual({ rows: [], refused: 1 });
    expect(mocks.persistNodeRefusal).toHaveBeenCalledWith("node_1", WEB_ANALYTICS_REFUSED_AT, { refused: true, read: false }, now);
  });

  it("does not persist a 403 refused read", async () => {
    mocks.countWebAnalytics.mockResolvedValue({ ok: false, reason: "not_readable", status: 403 });

    expect(await webAnalyticsNumbers("user_1", now)).toEqual({ rows: [], refused: 1 });
    expect(mocks.persistNodeRefusal).not.toHaveBeenCalled();
  });

  it("keeps the refusal visible without another read for 24 hours", async () => {
    mocks.projects = [project(new Date(now - REFUSAL_TTL_MS + 1).toISOString())];

    expect(await webAnalyticsNumbers("user_1", now)).toEqual({ rows: [], refused: 1 });
    expect(mocks.countWebAnalytics).not.toHaveBeenCalled();
  });

  it("clears an expired refusal after a successful read", async () => {
    mocks.projects = [project(new Date(now - REFUSAL_TTL_MS).toISOString())];
    mocks.countWebAnalytics.mockResolvedValue({ ok: true, counts: { visitors: 5, pageviews: 6, clicks: 0, weekVisitors: 20 } });

    const result = await webAnalyticsNumbers("user_1", now);

    expect(result.rows).toHaveLength(1);
    expect(mocks.countWebAnalytics).toHaveBeenCalledOnce();
    expect(mocks.persistNodeRefusal).toHaveBeenCalledWith("node_1", WEB_ANALYTICS_REFUSED_AT, { refused: false, read: true }, now);
  });
});
