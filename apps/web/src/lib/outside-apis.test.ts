import { describe, expect, it } from "vitest";
import { classifyOutsideApis } from "./outside-apis";

describe("outside API classification", () => {
  it("requires ten failures and at least half of all calls", () => {
    expect(classifyOutsideApis([
      { host: "under-count.example", total: 9, byStatus: { "401": 9 } },
      { host: "under-ratio.example", total: 21, byStatus: { "200": 11, "403": 10 } },
      { host: "at-edge.example", total: 20, byStatus: { "200": 10, "401": 10 } },
    ], [])).toEqual([{ host: "at-edge.example", kind: "key_or_permission", failing: 10, total: 20 }]);
  });

  it("ignores the project's own hosts and vercel.app deployments", () => {
    expect(classifyOutsideApis([
      { host: "api.my-product.com", total: 10, byStatus: { "403": 10 } },
      { host: "my-product.vercel.app", total: 10, byStatus: { "500": 10 } },
      { host: "api.vercel.com", total: 10, byStatus: { "500": 10 } },
    ], ["API.MY-PRODUCT.COM", "api.vercel.com"])).toEqual([]);
  });

  it("picks the kind with the most failures and sorts findings by failure count", () => {
    expect(classifyOutsideApis([
      { host: "vendor.example", total: 30, byStatus: { "401": 10, "429": 2, "500": 12, "503": 3, "200": 3 } },
      { host: "quota.example", total: 20, byStatus: { "402": 4, "429": 8, "500": 1, "200": 7 } },
    ], [])).toEqual([
      { host: "vendor.example", kind: "vendor_down", failing: 15, total: 30 },
      { host: "quota.example", kind: "quota_or_rate_limit", failing: 12, total: 20 },
    ]);
  });
});
