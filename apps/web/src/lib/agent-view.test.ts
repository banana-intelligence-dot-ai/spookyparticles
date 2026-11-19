import { describe, expect, it, vi } from "vitest";
import { agentViewOf, isLlmsTxt, isMarkdown, markdownWords, visibleWords, type Fetched } from "./agent-view";

vi.mock("@/db", () => ({ getDb: vi.fn(), schema: {} }));
vi.mock("@/lib/node-reads", () => ({ readNodes: vi.fn() }));
vi.mock("@/lib/vercel-monitor", () => ({ siteTargets: vi.fn() }));

const resolve = async () => [{ address: "76.76.21.21", family: 4 }];
const html = (body: string) => `<!doctype html><html><head><title>Hi</title><script>var a = "not words here";</script></head><body>${body}</body></html>`;
function site(routes: Record<string, (accept: string) => Fetched>) {
  const calls: string[] = [];
  const get = vi.fn(async (url: URL, _a: string, _f: number, headers: Record<string, string>) => {
    calls.push(`${url.toString()} ${headers.accept}`);
    const route = routes[url.pathname];
    return route ? route(headers.accept) : { status: 404, type: "text/html", body: html("Not found"), capped: false };
  });
  return { get, calls };
}

describe("visibleWords", () => {
  it("counts only what a person sees", () => {
    expect(visibleWords(html("<h1>Fix Vercel deploys</h1><style>.a{}</style><svg><text>chart label</text></svg><p>Two&nbsp;more words &amp; done</p><!-- hidden comment -->"))).toBe(7);
  });
  it("counts Markdown words without link addresses", () => {
    expect(markdownWords("# Title\n\nRead [the guide](https://example.com/a/b) now.\n```bash\nnpm test\n```")).toBe(7);
  });
});

describe("served checks", () => {
  it("does not count an HTML app shell as Markdown or llms.txt", () => {
    expect(isMarkdown({ status: 200, type: "text/markdown; charset=utf-8", body: "# Hi", capped: false })).toBe(true);
    expect(isMarkdown({ status: 200, type: "text/html", body: html("Hi"), capped: false })).toBe(false);
    expect(isLlmsTxt({ status: 200, type: "text/plain", body: "<!doctype html><html>", capped: false })).toBe(false);
    expect(isLlmsTxt({ status: 200, type: "text/plain", body: "# Site\n> about", capped: false })).toBe(true);
    expect(isLlmsTxt({ status: 404, type: "text/plain", body: "missing", capped: false })).toBe(false);
  });
});

describe("agentViewOf", () => {
  const known = new Set(["example.com", "www.example.com"]);
  it("reports bytes, words, a Markdown version and llms.txt", async () => {
    const page = html("<p>Three plain words</p>");
    const { get, calls } = site({
      "/": (accept) => accept === "text/markdown" ? { status: 200, type: "text/markdown", body: "Three plain words", capped: false } : { status: 200, type: "text/html", body: page, capped: false },
      "/llms.txt": () => ({ status: 200, type: "text/plain", body: "# Example\n", capped: false }),
    });
    const v = await agentViewOf("example", "https://example.com", known, { resolve, get });
    expect(v).toMatchObject({ state: "ok", url: "https://example.com/", page: { bytes: Buffer.byteLength(page), words: 3, capped: false }, markdown: { served: true, words: 3 }, llmsTxt: { served: true } });
    expect(v.summary).toMatch(/^An agent reads \d+ bytes to get 3 words\. Markdown version answers \(\d+ bytes\)\. llms\.txt answers\.$/);
    expect(calls).toContain("https://example.com/ text/markdown");
  });
  it("says so when neither answers", async () => {
    const { get } = site({ "/": () => ({ status: 200, type: "text/html", body: html("<p>Hello there</p>"), capped: false }), "/llms.txt": () => ({ status: 200, type: "text/html", body: html("app shell"), capped: false }) });
    const v = await agentViewOf("example", "https://example.com", known, { resolve, get });
    expect(v.markdown.served).toBe(false);
    expect(v.llmsTxt.served).toBe(false);
    expect(v.summary).toContain("No Markdown version. No llms.txt.");
  });
  it("follows a redirect inside the site's own hosts and checks the final origin", async () => {
    const { get, calls } = site({});
    get.mockImplementation(async (url: URL, _a, _f, headers) => {
      calls.push(`${url.toString()} ${headers.accept}`);
      if (url.hostname === "example.com") return { status: 308, location: "https://www.example.com/", body: "", capped: false };
      return url.pathname === "/llms.txt" ? { status: 200, type: "text/plain", body: "ok", capped: false } : { status: 200, type: "text/html", body: html("Hi"), capped: false };
    });
    const v = await agentViewOf("example", "https://example.com", known, { resolve, get });
    expect(v.url).toBe("https://www.example.com/");
    expect(calls).toContain("https://www.example.com/llms.txt text/plain, text/markdown");
  });
  it("never leaves the site's own hosts", async () => {
    const { get } = site({});
    get.mockResolvedValue({ status: 302, location: "https://evil.test/", body: "", capped: false });
    const v = await agentViewOf("example", "https://example.com", known, { resolve, get });
    expect(v).toMatchObject({ state: "unknown", reason: "unreachable", page: null });
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("reports a login wall and a missing site plainly", async () => {
    const { get } = site({ "/": () => ({ status: 401, type: "text/html", body: "", capped: false }) });
    expect((await agentViewOf("example", "https://example.com", known, { resolve, get })).summary).toBe("The site asks for a login, so an agent gets nothing.");
    expect((await agentViewOf("example", null, known, { resolve, get })).reason).toBe("no_production_site");
  });
  it("refuses a private address", async () => {
    const { get } = site({});
    const v = await agentViewOf("example", "https://example.com", known, { resolve: async () => [{ address: "10.0.0.1", family: 4 }], get });
    expect(v.reason).toBe("unreachable");
    expect(get).not.toHaveBeenCalled();
  });
});
