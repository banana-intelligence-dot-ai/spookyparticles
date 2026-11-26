import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel commit author is required: fix";
const DESCRIPTION =
  "Vercel could not match the commit author to a user with project access. Set your git email to one on your GitHub account, link Vercel, then push a new commit.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-commit-author-is-required" },
};

const FAQ = [
  ["Why does Vercel say a commit author is required?", "Vercel could not match the commit's author to a user with access to the project. The usual cause is a git email that is not on your git provider account, or an author who is not a member of the Vercel team."],
  ["How do I fix a commit author is required on Vercel?", "Run git config user.email and make sure it is a verified email on your GitHub, GitLab or Bitbucket account. Link that provider to your Vercel account, then push a new commit with the corrected email."],
  ["Does a Hobby team allow other committers?", "Vercel says a Hobby team does not support collaboration on private repositories, and a commit deploys only when its author is the team owner. A Pro team can add members."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-commit-author-is-required.md. Keep FAQ in step with it. */
export default function VercelCommitAuthorPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-commit-author-is-required.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
