/**
 * GET /docs/<slug>.md (next.config.ts rewrites it here): the same Markdown file the docs page renders,
 * served as plain text for agents and answer engines. Only slugs listed in pages.ts exist; anything else is a 404.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { docsPage } from "../../pages";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = docsPage(slug);
  if (!page) return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const body = readFileSync(path.join(process.cwd(), "content/docs", `${page.slug}.md`), "utf8");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
