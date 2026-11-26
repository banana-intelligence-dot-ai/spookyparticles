import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel 404 NOT_FOUND: causes and fix";
const DESCRIPTION =
  "Fix Vercel 404 NOT_FOUND by checking the URL, deployment, logs, permissions, route, output directory, and domain, then redeploy.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-404-not-found" },
};

const FAQ = [
  ["What does Vercel 404 NOT_FOUND mean?", "Vercel could not find the requested resource. It may have moved or been deleted, or the URL may contain a typo."],
  ["How do I fix Vercel 404 NOT_FOUND?", "Check the deployment URL, confirm the deployment still exists, review its logs, and verify your permissions. Then check the route or file name, output directory, and domain before redeploying."],
  ["Can I show a custom 404 page?", "Yes. Vercel supports a custom 404 page for a URL that does not exist in a deployment, but it does not make the missing resource exist."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-404-not-found.md. Keep FAQ in step with it. */
export default function Vercel404NotFoundPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-404-not-found.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
