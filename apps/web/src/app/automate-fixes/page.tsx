import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "How to automate fixes for failed Vercel deploys and scheduled jobs with your own coding agent";
const DESCRIPTION =
  "Connect Vercel and GitHub, add one workflow per repo, and each failed deploy or missed job goes to your own coding agent, which writes the fix as a pull request.";
const BASE = "https://spookyparticles.com";

export const metadata: Metadata = {
  title: "Automate fixes with your coding agent",
  description: DESCRIPTION,
  alternates: { canonical: "/automate-fixes" },
};

const STEPS = [
  ["Give your agent setup.md", "Claude Code and Codex can both read it."],
  ["Connect GitHub and Vercel", "Approve the agent's sign-in code, then connect both accounts on one page. Spooky reads both. In your repos it can also start the fix workflow."],
  ["Save one token", "Run claude setup-token once in your own terminal. Your agent stores it as a repository secret without seeing it."],
  ["Add the fix workflow", "Your agent adds .github/workflows/spooky-fix.yml to each repo by pull request. Merge it."],
  ["Cover jobs on other hosts", "Your agent adds a check-in, so a missed run counts as a failure too."],
];

const FAQ = [
  ["Which coding agents work?", "Claude Code runs the GitHub workflow. Codex can use the same API and MCP server from your editor."],
  ["Does it ship the fix itself?", "Spooky never does. Your agent opens a pull request, or ships directly only where your repo's CLAUDE.md or AGENTS.md allows it."],
  ["What counts as a failure?", "A failed production deploy, a page that stops answering, or a scheduled job that misses or reports an error."],
  ["Do I need to change my code?", "With a Vercel read token, Vercel cron jobs are watched with no code change. With the Vercel integration alone, and for jobs on other hosts, add a one-line check-in."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: TITLE,
    description: DESCRIPTION,
    url: `${BASE}/automate-fixes`,
    step: STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/automate-fixes.md. Keep STEPS and FAQ in step with it. */
export default function AutomateFixesPage() {
  const md = readFileSync(path.join(process.cwd(), "content/automate-fixes.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
