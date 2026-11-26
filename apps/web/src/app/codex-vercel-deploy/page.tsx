import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Deploy to Vercel with Codex";
const DESCRIPTION =
  "How to deploy a Vercel preview with Codex, and what to do when the deploy fails. Free with your own coding agent.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/codex-vercel-deploy" },
};

const FAQ = [
  ["How do I deploy to Vercel with Codex?", "Open your project in Codex, ask it to build the app, then use the Vercel plugin to deploy a preview. Have it run the local build and check that the deployment is ready before it hands you the URL."],
  ["What if I do not use the plugin?", "Run the Vercel CLI from the project root. The vercel deploy command deploys a project from its root directory or from a path you give it."],
  ["What happens when the Vercel deploy fails?", "Codex can read the Vercel build logs and fix the cause. With agent alerts on, Spooky tells Codex about a failed deploy when a session starts, and passes the build log line when it can find one."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/codex-vercel-deploy.md. Keep FAQ in step with it. */
export default function CodexVercelDeployPage() {
  const md = readFileSync(path.join(process.cwd(), "content/codex-vercel-deploy.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
