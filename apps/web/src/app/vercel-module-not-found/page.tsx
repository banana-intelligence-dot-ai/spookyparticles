import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel module not found: cause and fix";
const DESCRIPTION =
  "A Vercel build says Module not found when it cannot resolve an import. Check file name capitals, a missing package and the relative path, then redeploy.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-module-not-found" },
};

const FAQ = [
  ["Why does Vercel say Module not found?", "The build could not resolve an import. The most common cause is a file name whose capital letters differ from the import: Windows and macOS ignore case by default, and the Linux build does not. A package missing from package.json and a wrong relative path are the other causes."],
  ["Why does the build pass on my machine but fail on Vercel?", "Usually capital letters. Windows and macOS ignore case by default, so an import that does not match the file name still works locally. Vercel's build is case-sensitive, so make the import match the file name exactly, commit and redeploy."],
  ["Why does Vercel still see the old file name after I renamed it?", "On a case-insensitive system Git can miss a rename that only changes capital letters. Vercel's guide says to rename the file in two steps through a temporary name and commit both steps together."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-module-not-found.md. Keep FAQ in step with it. */
export default function VercelModuleNotFoundPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-module-not-found.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
