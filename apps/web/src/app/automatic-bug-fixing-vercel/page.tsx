import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Automatic bug fixing for Vercel apps";
const DESCRIPTION =
  "Spooky tells your coding agent what broke on Vercel so it can propose a fix for you to review. Free with your own agent.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/automatic-bug-fixing-vercel" },
};

const FAQ = [
  ["How does bug fixing with a coding agent work?", "A deploy fails or a scheduled job misses. Spooky tells your coding agent what broke. The agent proposes a fix that you review and merge."],
  ["What can the agent fix and what can it not?", "The agent can propose code changes for a failed build, a broken function, or a scheduled job. It cannot fix a Vercel outage or a bad account setting."],
  ["Where does Spooky fit?", "Spooky watches for the failure and gives the useful evidence to your own coding agent. The agent works in your repo and proposes the change. You stay in control of review and merge."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/automatic-bug-fixing-vercel.md. Keep FAQ in step with it. */
export default function AutomaticBugFixingVercelPage() {
  const md = readFileSync(path.join(process.cwd(), "content/automatic-bug-fixing-vercel.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
