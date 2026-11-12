import { readFileSync } from "node:fs";
import path from "node:path";

export function GET() {
  return new Response(readFileSync(path.join(process.cwd(), "content/skills/spooky/SKILL.md"), "utf8"), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
