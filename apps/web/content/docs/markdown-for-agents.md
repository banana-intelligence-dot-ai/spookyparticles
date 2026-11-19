# Markdown for agents

AI agents read your pages to answer questions and to work on your code. A home page can be hundreds of kilobytes of HTML around a few hundred words. A plain Markdown version gives an agent the same words without the weight.

The Check page has a "What AI agents get" section. It reads each of your Vercel sites and shows, per site:

- how many bytes an agent downloads from the home page, and how many words it gets
- whether a Markdown version answers when the request says `Accept: text/markdown`
- whether `/llms.txt` answers with text

Agents can run the same check with `GET /api/v1/agent-view` or the MCP tool `agent_view`. It only reads. It stores nothing.

## Serve a Markdown version in Next.js

This is how spookyparticles.com serves its own. It works on Vercel with no extra service.

1. Write the Markdown file with the same words as the page. No extra claims for machines, and no user-agent sniffing: every reader gets the same content.

2. Add a route that returns the file as `text/markdown`, for example `app/md/[...path]/route.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

const PAGES: Record<string, string> = { "/pricing": "content/pricing.md" };

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const page = `/${(await params).path.join("/")}`;
  const file = PAGES[page];
  if (!file) return new Response("Not found\n", { status: 404 });
  return new Response(readFileSync(path.join(process.cwd(), file), "utf8"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
      link: `<https://example.com${page}>; rel="canonical"`,
    },
  });
}
```

3. Point both the `.md` address and the Accept header at it in `next.config.ts`. Use `beforeFiles` so the rewrite runs before the page:

```ts
async rewrites() {
  return {
    beforeFiles: ["/pricing"].flatMap((p) => [
      { source: p, has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }], destination: `/md${p}` },
      { source: `${p}.md`, destination: `/md${p}` },
    ]),
  };
},
async headers() {
  return ["/pricing"].map((p) => ({ source: p, headers: [{ key: "Link", value: `<${p}.md>; rel="alternate"; type="text/markdown"` }] }));
},
```

4. Include the Markdown files in the function bundle with `outputFileTracingIncludes: { "/md/[...path]": ["./content/**/*.md"] }`.

5. List the `.md` addresses in `/llms.txt`.

## Static sites (no framework)

On a plain HTML site, a `vercel.json` rewrite on the Accept header never runs when a file exists at that address, because files win over rewrites. Use a routing file instead. It runs before the file is served.

1. Put the Markdown next to each page, for example `pricing/index.md` beside `pricing/index.html`.

2. Add `middleware.js` at the project root:

```js
const PAGES = ["/", "/pricing/"];

export const config = { matcher: ["/", "/pricing/:path*"] };

// True when Accept lists text/markdown and does not rule it out with q=0.
function wantsMarkdown(accept) {
  for (const part of accept.toLowerCase().split(",")) {
    const [type, ...params] = part.split(";").map((s) => s.trim());
    if (type !== "text/markdown") continue;
    const q = params.find((p) => p.startsWith("q="));
    return !q || parseFloat(q.slice(2)) > 0;
  }
  return false;
}

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
  if (!PAGES.includes(path) || !wantsMarkdown(request.headers.get("accept") || "")) {
    return new Response(null, { headers: { "x-middleware-next": "1", Vary: "Accept" } });
  }
  return new Response(null, {
    headers: {
      "x-middleware-rewrite": new URL(path + "index.md", url).toString(),
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
    },
  });
}
```

`Vary: Accept` keeps the cache from handing the Markdown to a browser.

3. Test it on a preview deployment, not with `vercel dev`. `vercel dev` does not test header conditions.

## Check it

```bash
curl -s -o /dev/null -w "%{content_type}\n" -H "Accept: text/markdown" https://example.com/pricing
```

It prints `text/markdown; charset=utf-8`. The same address in a browser still shows the HTML page. Then run "Check my sites" again on the Check page.

## What this does not promise

A Markdown version makes your words cheaper for an agent to read. Whether answer engines cite a page more because of it is not settled. We are measuring it on our own pages and will publish what we find.
