import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/incidents", () => ({ incidentsFor: vi.fn() }));
vi.mock("@/lib/projects", () => ({ projectsFor: vi.fn() }));
vi.mock("@/db", () => ({ getDb: vi.fn(), schema: {} }));
import { commitState, pageShows, pushCheckInput, type PageCheck } from "./push-check";
import type { AgentViewDeps, Fetched } from "./agent-view";

const resolve = async () => [{ address: "76.76.21.21", family: 4 }];
function site(pages: Record<string, Fetched>): AgentViewDeps & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked, resolve,
    get: async (url) => { asked.push(url.toString()); return pages[url.toString()] ?? { status: 404, body: "", capped: false }; },
  };
}
const html = (body: string): Fetched => ({ status: 200, type: "text/html", body: `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`, capped: false });

describe("pageShows", () => {
  it("shows when the text is in what a person sees, across tags and entities", async () => {
    const deps = site({ "https://example.com/pricing": html("<h1>Free, requires your <em>own</em> coding&nbsp;agent</h1>") });
    const r: PageCheck = await pageShows("https://example.com", "/pricing", "Free, requires your own coding agent", deps);
    expect(r.state).toBe("shows");
    expect(r.summary).toContain("answers 200");
  });
  it("says missing_text when the page answers without the text", async () => {
    const r = await pageShows("https://example.com", "/", "New headline", site({ "https://example.com/": html("<h1>Old headline</h1>") }));
    expect(r.state).toBe("missing_text");
  });
  it("reports the status of a page that is not 200", async () => {
    const r = await pageShows("https://example.com", "/gone", "x", site({}));
    expect(r).toMatchObject({ state: "bad_status", status: 404 });
  });
  it("never leaves the production host, even when the page redirects away", async () => {
    const deps = site({ "https://example.com/": { status: 302, location: "https://evil.test/", body: "", capped: false } });
    const r = await pageShows("https://example.com", "/", "x", deps);
    expect(r.state).toBe("unreachable");
    expect(deps.asked).toEqual(["https://example.com/"]);
  });
  it("keeps the path on the production origin", async () => {
    const deps = site({});
    await pageShows("https://example.com/some/base", "/a?b=1", "x", deps);
    expect(deps.asked).toEqual(["https://example.com/a?b=1"]);
  });
  it("needs a production site", async () => {
    expect((await pageShows(null, "/", "x", site({}))).state).toBe("no_production_site");
  });
  it("says a login page is protected", async () => {
    const r = await pageShows("https://example.com", "/", "x", site({ "https://example.com/": { status: 401, body: "", capped: false } }));
    expect(r.state).toBe("site_protected");
  });
});

describe("pushCheckInput", () => {
  it("accepts a repo alone and the full set", () => {
    expect(pushCheckInput({ repo: "a/b" })).toEqual({ repo: "a/b" });
    expect(pushCheckInput({ repo: "a/b", sha: "abc1234", path: "/p", expectText: " Hi " })).toEqual({ repo: "a/b", sha: "abc1234", path: "/p", expectText: "Hi" });
  });
  it.each([
    [{ repo: "nope" }, "repo"],
    [{ repo: "a/b", sha: "xyz" }, "sha"],
    [{ repo: "a/b", path: "//evil.test/", expectText: "x" }, "path"],
    [{ repo: "a/b", path: "https://evil.test/", expectText: "x" }, "path"],
    [{ repo: "a/b", path: "/p" }, "expectText"],
    [{ repo: "a/b", expectText: "x".repeat(201) }, "expectText"],
  ])("refuses %j", (raw, word) => {
    expect(() => pushCheckInput(raw)).toThrow(word);
  });
});

describe("commitState", () => {
  const prod = (sha: string, state: string) => ({ environment: "Production", state, sha });
  it("names each place a commit can be", () => {
    expect(commitState([prod("abc1234", "success")], "abc1234", true)).toBe("live");
    expect(commitState([prod("abc1234ff", "in_progress")], "abc1234", false)).toBe("building");
    expect(commitState([prod("abc1234", "failure")], "abc1234", false)).toBe("failed");
    expect(commitState([prod("abc1234", "inactive"), prod("def5678", "success")], "abc1234", false)).toBe("replaced");
    expect(commitState([prod("def5678", "success"), { environment: "Preview", state: "success", sha: "abc1234" }], "abc1234", false)).toBe("not_seen_yet");
  });
});
