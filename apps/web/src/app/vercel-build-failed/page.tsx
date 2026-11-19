import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel build failed? Find the cause";
const DESCRIPTION =
  "A Vercel build usually fails when the build command errors. Read the log, check the lines above the last Error, run the build on your machine, and push again.";
const BASE = "https://spookyparticles.com";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-build-failed" },
};

const STEPS = [
  ["Open the failed deployment", "In the Vercel dashboard, open the project, go to Deployments and select the deployment with the error status."],
  ["Read the build log", "Expand the Building accordion and find the red section with the word Error. The last mention is often not the useful one, so check the lines above it."],
  ["Run the build locally", "Run the project's build command on your own machine, for a Next.js app usually npm run build, to catch problems in your code or dependencies."],
  ["Fix and push", "Fix the cause, commit, and push to start a new build."],
];

const FAQ = [
  ["Why did my Vercel build fail?", "Usually the build command exited with an error, though a platform limit or a missing precondition can also stop a build. In the log, the cause is often a few lines above the last Error line. Vercel recommends running the build on your own machine first."],
  ["Why does my build fail on Vercel but work on my machine?", "A common cause is NODE_ENV set to production, which makes npm, pnpm 9 and earlier, and Yarn 1 skip devDependencies. Remove the variable, or override the Install Command to keep devDependencies."],
  ["What if the build failed but there is no build log?", "Some builds fail before they start, so Vercel shows the error in an overlay. Vercel lists an invalid vercel.json, an Ignored Build Step, a commit from a non-member and a failed integration resource as causes."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: TITLE,
    description: DESCRIPTION,
    url: `${BASE}/vercel-build-failed`,
    step: STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-build-failed.md. Keep STEPS and FAQ in step with it. */
export default function VercelBuildFailedPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-build-failed.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
