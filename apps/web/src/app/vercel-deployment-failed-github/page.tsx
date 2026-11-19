import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel deploy failed from GitHub? Fix it";
const DESCRIPTION =
  "When a Vercel deploy from GitHub fails, the cause is usually in the build log. Read the error, fix it in the repo, and push again.";
const BASE = "https://spookyparticles.com";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-deployment-failed-github" },
};

const STEPS = [
  ["Open the failed deployment", "Click Details on the Vercel status in GitHub, or open the project in the Vercel dashboard, go to Deployments and select the deployment with the error status."],
  ["Open the build log", "Expand the Building accordion."],
  ["Find the error line", "Find the red section that names the error. Vercel notes the last mention is often not the most useful one, and the log may not hold it at all."],
  ["Fix and push", "Fix the cause in the repo, commit, and push to start a new deployment."],
];

const FAQ = [
  ["Why does a GitHub push show a failed Vercel deployment?", "Vercel deploys every push by default and sets a commit status of deployed, failed or skipped. A failed status means the deployment itself failed, and the reason is usually in the build log on Vercel."],
  ["What if there is no build log, or no deployment at all?", "Some deployments fail before a build starts and show the error in an overlay. Check that the Vercel GitHub App can see the repository, that your role on it allows connecting, and that the commit author has access. A fork pull request needs authorization, and an invalid vercel.json or an Ignored Build Step can stop a build before it begins."],
  ["Can GitHub Actions react to a failed Vercel deploy?", "Yes. Vercel sends repository_dispatch events such as vercel.deployment.error, and a workflow on the default branch can listen for them."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: TITLE,
    description: DESCRIPTION,
    url: `${BASE}/vercel-deployment-failed-github`,
    step: STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-deployment-failed-github.md. Keep STEPS and FAQ in step with it. */
export default function VercelDeploymentFailedGithubPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-deployment-failed-github.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
