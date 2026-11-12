import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildErrorRateQuery, buildRequestCountQuery, parseRequestCounts, queryRequestCounts, summariseStatusCounts } from "./vercel-query";

const scope = { kind: "team" as const, id: "team_1", slug: "team", name: "Team" };

afterEach(() => vi.unstubAllGlobals());

describe("Vercel request history query", () => {
  it("builds the bounded, escaped, read-only metric query", () => {
    const body = buildRequestCountQuery(scope, "prj_1", ["/api/a", "/api/o'brien"], 0, 7 * 60 * 60_000);
    expect(body).toMatchObject({ metric: "vercel.request.count", aggregation: "sum", scope: { type: "project", ownerId: "team_1", projectIds: ["prj_1"] }, filter: "(request_path eq '/api/a' or request_path eq '/api/o''brien') and client_user_agent eq 'vercel-cron/1.0'", groupBy: ["request_path", "http_status"], granularity: { minutes: 1 }, limit: 500 });
    expect(Date.parse(body.endTime) - Date.parse(body.startTime)).toBe(2 * 60 * 60_000);
    for (const path of ["bad", "/" + "a".repeat(512), "/bad\npath"]) expect(() => buildRequestCountQuery(scope, "p", [path], 0, 1000)).toThrow();
    expect(() => buildRequestCountQuery(scope, "p", Array.from({ length: 41 }, (_, i) => `/${i}`), 0, 1000)).toThrow();
  });
  it("builds the second read-only request-count shape and summarizes 5xx", () => {
    expect(buildErrorRateQuery(scope, "p", 0, 60 * 60_000)).toMatchObject({ metric: "vercel.request.count", aggregation: "sum", groupBy: ["http_status"], granularity: { minutes: 5 }, limit: 500, startTime: new Date(45 * 60_000).toISOString() });
    expect(summariseStatusCounts({ data: [{ http_status: "200", vercel_request_count_sum: 40 }, { http_status: "500", vercel_request_count_sum: 10 }, { http_status: "599", vercel_request_count_sum: 2 }, { http_status: "bad", vercel_request_count_sum: 99 }] })).toEqual({ total: 52, serverErrors: 12 });
  });
  it("ignores zero and malformed buckets", () => {
    expect(parseRequestCounts({ data: [
      { timestamp: "2026-11-10T18:10:00Z", vercel_request_count_sum: 1, request_path: "/api/a", http_status: "200" },
      { timestamp: "2026-11-10T18:11:00Z", vercel_request_count_sum: 0, request_path: "/api/a", http_status: "200" },
      { timestamp: "bad", vercel_request_count_sum: 1, request_path: "/api/a", http_status: "500" },
    ] })).toEqual([{ atMs: Date.parse("2026-11-10T18:10:00Z"), path: "/api/a", status: 200 }]);
  });
  it("uses the sole POST and treats denied or broken history as unreadable", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 })).mockResolvedValueOnce(new Response("denied", { status: 403 })).mockResolvedValueOnce(new Response("bad", { status: 500 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await queryRequestCounts("token", scope, "p", ["/a"], 0, 1000)).toEqual({ ok: true, evidence: [] });
    expect(String(fetcher.mock.calls[0][0])).toBe("https://api.vercel.com/v2/observability/query?teamId=team_1");
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
    expect(await queryRequestCounts("token", scope, "p", ["/a"], 0, 1000)).toEqual({ ok: false, reason: "not_readable", status: 403 });
    expect(await queryRequestCounts("token", scope, "p", ["/a"], 0, 1000)).toEqual({ ok: false, reason: "unavailable" });
    expect(await queryRequestCounts("token", scope, "p", ["/a"], 0, 1000)).toEqual({ ok: false, reason: "unavailable" });
  });
  it("aborts a stalled query after eight seconds", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))));
      const pending = queryRequestCounts("token", scope, "p", ["/a"], 0, 1000);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await pending).toEqual({ ok: false, reason: "unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps both shapes of the same read-only customer-token POST in this one file", () => {
    const root = join(process.cwd(), "src");
    function scan(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? scan(join(dir, entry.name)) : entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [join(dir, entry.name)] : []);
    }
    for (const file of scan(root)) {
      const path = relative(root, file);
      if (path.endsWith(".test.ts") || path === "lib/providers/vercel-query.ts" || path === "lib/providers/vercel-oauth.ts") continue;
      const source = readFileSync(file, "utf8");
      if (source.includes("api.vercel.com")) expect(source.match(/fetch\([^;]*method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/g), path).toBeNull();
    }
  });
});
