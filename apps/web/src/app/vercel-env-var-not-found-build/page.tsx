import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel env var not found in build? Fix it";
const DESCRIPTION =
  "A Vercel build cannot see a variable that is not set for its environment or was added after the deploy. Set it for that environment, then redeploy.";
const BASE = "https://spookyparticles.com";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-env-var-not-found-build" },
};

const STEPS = [
  ["Open Environment Variables", "In the Vercel dashboard, open the project settings and go to Environment Variables."],
  ["Set it for the building environment", "Add or edit the variable and choose Production, Preview, Development or the custom environment that is building."],
  ["Save and redeploy", "Changes apply only to new deployments, so redeploy after you save."],
];

const FAQ = [
  ["Why can't my Vercel build find an environment variable?", "The variable is usually not set for the environment that is building, or it was added after that deployment was made. Vercel applies changes only to new deployments."],
  ["Do environment variable changes apply to old deployments?", "No. Vercel says changes are not applied to previous deployments, only to new ones, so redeploy."],
  ["Is a missing variable always a build error?", "No. A missing variable can pass the build and only break the app when a request runs. Check the runtime logs as well as the build log."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: TITLE,
    description: DESCRIPTION,
    url: `${BASE}/vercel-env-var-not-found-build`,
    step: STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-env-var-not-found-build.md. Keep STEPS and FAQ in step with it. */
export default function VercelEnvVarNotFoundBuildPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-env-var-not-found-build.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
