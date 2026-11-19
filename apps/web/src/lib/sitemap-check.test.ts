import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/net-safety", () => ({
  resolvePublic: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
  pinnedGet: vi.fn(),
}));

import { pinnedGet, resolvePublic } from "@/lib/net-safety";
import { checkSitemap, readSitemap, sitemapDue, sitemapLocs } from "./sitemap-check";

const hosts = new Set(["example.com"]);
const site = "https://example.com";
const page = "https://example.com/one";
const up = vi.fn(async () => ({ kind: "up" as const, status: "200" }));
const at = Date.parse("2026-11-19T00:00:00Z");
const read = (urls: string[]) => vi.fn(async () => urls);

beforeEach(() => { vi.clearAllMocks(); });

describe("sitemap parsing and safe reads", () => {
  it("parses a urlset and XML entities", () => {
    expect(sitemapLocs('<urlset><url><loc>https://example.com/a&amp;b</loc></url><url><loc>https://example.com/&#x63;</loc></url></urlset>'))
      .toEqual({ kind: "urlset", urls: ["https://example.com/a&b", "https://example.com/c"] });
  });

  it("follows a sitemap index and filters outside hosts", async () => {
    vi.mocked(pinnedGet).mockImplementation(async (url) => ({
      status: 200, body: url.pathname === "/sitemap.xml"
        ? '<sitemapindex><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>'
        : '<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://other.com/b</loc></url></urlset>',
      capped: false,
    }));
    expect(await readSitemap(site, hosts)).toEqual(["https://example.com/a"]);
    expect(pinnedGet).toHaveBeenCalledTimes(2);
    expect(resolvePublic).toHaveBeenCalledWith("example.com", expect.any(Number));
  });

  it("refuses an index child outside the known hosts", async () => {
    vi.mocked(pinnedGet).mockResolvedValue({ status: 200, body: '<sitemapindex><sitemap><loc>https://other.com/child.xml</loc></sitemap></sitemapindex>', capped: false });
    await expect(readSitemap(site, hosts)).rejects.toThrow("unsafe child sitemap");
    expect(pinnedGet).toHaveBeenCalledTimes(1);
  });
});

describe("sitemap state", () => {
  it("stores a first read without alerting", async () => {
    const result = await checkSitemap("p", "Project", site, hosts, null, at, read([page]), up);
    expect(result.state.urls).toEqual([page]);
    expect(result.events).toEqual([]);
  });

  it("alerts once when a page drops and clears on return", async () => {
    const first = await checkSitemap("p", "Project", site, hosts, null, at, read([page, "https://example.com/two"]), up);
    const second = await checkSitemap("p", "Project", site, hosts, first.state, at + 6 * 3600_000, read(["https://example.com/two"]), up);
    expect(second.events.filter((e) => e.kind === "sitemap_page_dropped")).toHaveLength(1);
    expect(second.events[0].text).toContain(first.state.checkedAt);
    const third = await checkSitemap("p", "Project", site, hosts, second.state, at + 12 * 3600_000, read(["https://example.com/two"]), up);
    expect(third.events).toEqual([]);
    const fourth = await checkSitemap("p", "Project", site, hosts, third.state, at + 18 * 3600_000, read([page, "https://example.com/two"]), up);
    expect(fourth.state.alertedMissing).toEqual([]);
    expect(fourth.events).toEqual([expect.objectContaining({ kind: "sitemap_resolved", silent: true })]);
  });

  it("keeps the baseline when the list shrinks by more than half", async () => {
    const urls = ["a", "b", "c"].map((x) => `https://example.com/${x}`);
    const first = await checkSitemap("p", "Project", site, hosts, null, at, read(urls), up);
    const second = await checkSitemap("p", "Project", site, hosts, first.state, at + 6 * 3600_000, read([urls[0]]), up);
    expect(second.state.urls).toEqual(urls);
    expect(second.events).toEqual([]);
    const third = await checkSitemap("p", "Project", site, hosts, second.state, at + 12 * 3600_000, read([]), up);
    expect(third.events.map((e) => e.kind)).toEqual(["sitemap_unreadable"]);
  });

  it("alerts after two down checks and clears on recovery", async () => {
    const down = vi.fn(async () => ({ kind: "down" as const, status: "404" }));
    const first = await checkSitemap("p", "Project", site, hosts, null, at, read([page]), down);
    const second = await checkSitemap("p", "Project", site, hosts, first.state, at + 6 * 3600_000, read([page]), down);
    expect(second.events.map((e) => e.kind)).toEqual(["sitemap_page_down"]);
    const third = await checkSitemap("p", "Project", site, hosts, second.state, at + 12 * 3600_000, read([page]), down);
    expect(third.events).toEqual([]);
    const fourth = await checkSitemap("p", "Project", site, hosts, third.state, at + 18 * 3600_000, read([page]), up);
    expect(fourth.events).toEqual([expect.objectContaining({ kind: "sitemap_resolved", silent: true })]);
  });

  it("closes a down episode if the page leaves the sitemap", async () => {
    const other = "https://example.com/two";
    const down = vi.fn(async (url: string) => ({ kind: url === page ? "down" as const : "up" as const, status: url === page ? "404" : "200" }));
    const first = await checkSitemap("p", "Project", site, hosts, null, at, read([page, other]), down);
    const second = await checkSitemap("p", "Project", site, hosts, first.state, at + 6 * 3600_000, read([page, other]), down);
    const third = await checkSitemap("p", "Project", site, hosts, second.state, at + 12 * 3600_000, read([other]), down);
    expect(third.events.map((e) => e.kind)).toEqual(["sitemap_page_dropped", "sitemap_resolved"]);
    expect(third.state.failing[page]).toBeUndefined();
  });

  it("respects the six hour cadence", () => {
    expect(sitemapDue({ checkedAt: new Date(at).toISOString() }, at + 6 * 3600_000 - 1)).toBe(false);
    expect(sitemapDue({ checkedAt: new Date(at).toISOString() }, at + 6 * 3600_000)).toBe(true);
  });
});

describe("a site with no sitemap", () => {
  it("never alerts when no sitemap was ever read", async () => {
    const none = vi.fn(async () => { throw new Error("sitemap unreadable"); });
    const first = await checkSitemap("p", "Proj", site, hosts, null, at, none, up);
    const second = await checkSitemap("p", "Proj", site, hosts, first.state, at + 7 * 3_600_000, none, up);
    expect([...first.events, ...second.events]).toEqual([]);
  });
});
