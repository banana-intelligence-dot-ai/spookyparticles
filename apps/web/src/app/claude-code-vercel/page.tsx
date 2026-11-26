import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Claude Code with Vercel: MCP, CLI, plugin";
const DESCRIPTION =
  "Connect Claude Code to Vercel with the MCP server, then read logs with the CLI or add the plugin. See how a failed deploy reaches Claude Code.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/claude-code-vercel" },
};

const FAQ = [
  ["How do I connect Claude Code to Vercel?", "Run claude mcp add --transport http vercel https://mcp.vercel.com in your project folder, start claude, then type /mcp to sign in. Vercel's docs list Claude Code as a supported MCP client."],
  ["Can Claude Code read my Vercel logs?", "Yes. Vercel says its MCP server can analyze deployment logs, and Claude Code can also run the Vercel CLI, for example vercel logs, in your terminal."],
  ["Is there a Vercel plugin for Claude Code?", "Yes. Vercel's plugin for AI coding agents lists Claude Code as supported. Install it with npx plugins add vercel/vercel-plugin. It adds Vercel context, skills, agents and slash commands."],
  ["Can Claude Code find out when a Vercel deploy fails?", "Spooky Particles watches your Vercel projects and, when a production deploy fails, passes the error line from the build log to Claude Code or Codex. The agent proposes the fix. Spooky never changes your code itself."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/claude-code-vercel.md. Keep FAQ in step with it. */
export default function ClaudeCodeVercelPage() {
  const md = readFileSync(path.join(process.cwd(), "content/claude-code-vercel.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
