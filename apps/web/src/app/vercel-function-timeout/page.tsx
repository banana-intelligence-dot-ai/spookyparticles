import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel function timeout: fixes";
const DESCRIPTION =
  "Fix a Vercel 504 FUNCTION_INVOCATION_TIMEOUT by checking slow calls, response paths, loops, maxDuration, Fluid Compute, and Edge runtime behavior.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-function-timeout" },
};

const FAQ = [
  ["Why does a Vercel function time out?", "A Vercel function times out when it runs longer than its configured duration, its code is inefficient, an upstream service is slow or unresponsive, a code path returns no response, or a loop never ends. Check runtime logs and call durations, then use the smallest matching fix."],
  ["Where does Spooky fit?", "Spooky can tell your coding agent when a site's server errors rise, if it can read that project's request history on Vercel. Spooky tells your own coding agent what broke, and the agent proposes the fix. Spooky never changes your code itself."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-function-timeout.md. Keep FAQ in step with it. */
export default function VercelFunctionTimeoutPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-function-timeout.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
