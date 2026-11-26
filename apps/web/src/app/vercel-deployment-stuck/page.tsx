import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel deployment stuck in queued: fixes";
const DESCRIPTION =
  "Fix a Vercel deployment stuck in queued or initializing by checking build concurrency, project settings, the deployment list, and Vercel's status page.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-deployment-stuck" },
};

const FAQ = [
  ["Why is my Vercel deployment stuck in queued?", "A queued deployment is waiting behind another build because the available concurrency is in use. Hobby permits one concurrent deployment, so later builds run sequentially. Vercel's Managing Builds page lists production builds stuck behind preview builds as a case it has a fix for."],
  ["What should I do when a Vercel deployment is stuck on initializing?", "Check Vercel's status page. A deployment that does not progress can be part of a Vercel incident."],
  ["How do I start a queued Vercel build now?", "In the Vercel dashboard, open the project and its Deployments list. Find the queued deployment, select Start Building Now from its menu or detail page, and confirm the action."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-deployment-stuck.md. Keep FAQ in step with it. */
export default function VercelDeploymentStuckPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-deployment-stuck.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
