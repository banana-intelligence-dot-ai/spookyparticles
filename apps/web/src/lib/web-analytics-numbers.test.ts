import { describe, expect, it } from "vitest";
import { webAnalyticsRow } from "./web-analytics-numbers";

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
