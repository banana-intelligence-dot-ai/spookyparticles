/**
 * The Markdown twin of an answer page. next.config.ts rewrites <path>.md, and <path> with an
 * Accept header naming text/markdown, to here. Only pages listed in markdown-twins.ts answer.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { markdownTwin } from "@/lib/markdown-twins";

const BASE = "https://spookyparticles.com";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const twin = markdownTwin(`/${(await params).path.join("/")}`);
  if (!twin) return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(readFileSync(path.join(process.cwd(), twin.file), "utf8"), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
      vary: "Accept",
      // The HTML page stays the address search engines index.
      link: `<${BASE}${twin.path}>; rel="canonical"`,
    },
  });
}
