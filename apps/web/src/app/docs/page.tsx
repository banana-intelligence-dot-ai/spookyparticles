import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { DocsFrame } from "./docs-frame";
import { DOCS_PAGES } from "./pages";

export const metadata: Metadata = {
  title: "Docs",
  description: "Developer docs for Spooky Particles: quickstart, check-ins, alarm checks, the MCP server and the REST API.",
  alternates: { canonical: "/docs" },
};

export default function DocsIndex() {
  const intro = readFileSync(path.join(process.cwd(), "content/docs/index.md"), "utf8");
  const list = DOCS_PAGES.map((p) => `- [${p.title}](/docs/${p.slug}): ${p.description}`).join("\n");
  return <DocsFrame markdown={`${intro}\n${list}\n`} />;
}
