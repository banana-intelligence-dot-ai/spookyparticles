import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel deployment failed? Read the log";
const DESCRIPTION =
  "A failed Vercel deploy usually leaves a build log. Find the error line, fix it, and push again. Spooky can pass that line to your coding agent.";
const BASE = "https://spookyparticles.com";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-deployment-failed" },
};

const STEPS = [
  ["Open the failed deployment", "In the Vercel dashboard, open the project, then Deployments, and select the deployment with the error status."],
  ["Open the build log", "Expand the Building accordion."],
  ["Find the error line", "Scroll to the red section that contains the word Error. The last mention is often not the most useful one."],
  ["Build on your own machine", "Run the same build command locally to catch problems in your code or dependencies."],
  ["Fix and push", "Fix what the log names, commit, and push to start a new deployment."],
];

const FAQ = [
  ["How do I find out why my Vercel deployment failed?", "Open the failed deployment in the Vercel dashboard, expand the Building accordion, and look for the red section that names the error."],
  ["What if there is no build log?", "Some deployments fail before a build starts, for example from an invalid vercel.json. Vercel then shows the error in an overlay instead of a log."],
  ["Can my coding agent fix a failed deploy?", "Spooky passes the build log line to your coding agent, Claude Code or Codex, and the agent writes the fix. Spooky never changes your code itself."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: TITLE,
    description: DESCRIPTION,
    url: `${BASE}/vercel-deployment-failed`,
    step: STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-deployment-failed.md. Keep STEPS and FAQ in step with it. */
export default function VercelDeploymentFailedPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-deployment-failed.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
