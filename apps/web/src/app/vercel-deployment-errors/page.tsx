import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel deployment error? Find the fix";
const DESCRIPTION =
  "Vercel names a deployment error in the build log or on the deployment page. Match the error to this list from Vercel's own error docs, then fix it.";
const BASE = "https://spookyparticles.com";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-deployment-errors" },
};

const FAQ = [
  ["How do I find the error in my Vercel deployment?", "Open the project, go to Deployments, select the deployment with the error status and find the red Error section of the log, or read the message shown instead of a log."],
  ["What are the common Vercel deployment errors?", "Vercel's error list covers build and setting errors such as a missing output directory, a missing build script and recursive build commands, vercel.json errors such as an invalid route source, and Git and access errors such as a commit author without access to the project."],
  ["Why does my Vercel deployment fail with no error I recognize?", "Read the lines above the last mention of Error, which Vercel says is often not the useful one. Search the error text on Vercel's error list, then run the build command on your machine."],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

/** Source text in content/vercel-deployment-errors.md. Keep FAQ in step with it. */
export default function VercelDeploymentErrorsPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-deployment-errors.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
