import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const DESCRIPTION = "VibeOps is the work of keeping shipped apps running. Watch Vercel schedules and failed deploys, then ask your coding agent what broke.";

export const metadata: Metadata = {
  title: "VibeOps",
  description: DESCRIPTION,
  alternates: { canonical: "/vibeops" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name: "VibeOps",
  description: "VibeOps is the work of keeping shipped apps running.",
  url: "https://spookyparticles.com/vibeops",
  inDefinedTermSet: { "@type": "DefinedTermSet", name: "Spooky Particles", url: "https://spookyparticles.com" },
};

/** The definition of record. Source text in content/vibeops.md. */
export default function VibeOpsPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vibeops.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
