import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel 500 internal server error: fixes";
const DESCRIPTION =
  "Fix a Vercel 500 by checking the error code, function logs, environment variables, and unhandled errors.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-500-internal-server-error" },
};

const FAQ = [
  ["What does a Vercel 500 mean?", "A Vercel 500 means your function failed. The error code, such as FUNCTION_INVOCATION_FAILED, names the kind and the function logs show the cause. Check environment variables and unhandled errors first. The exception is INTERNAL_UNEXPECTED_ERROR, a general error that Vercel says to report to its support."],
  ["Where does Spooky fit?", "Spooky can tell your coding agent when a site's server errors rise, if it can read that project's request history on Vercel. Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent proposes the fix. Spooky never changes your code itself."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-500-internal-server-error.md. Keep FAQ in step with it. */
export default function Vercel500InternalServerErrorPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-500-internal-server-error.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
