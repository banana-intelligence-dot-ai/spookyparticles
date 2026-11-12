import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

export const metadata: Metadata = {
  title: "Releases",
  description: "What changed in Spooky Particles, dated, newest first. If it is on this page it is live.",
  alternates: { canonical: "/releases" },
};

/** The public release log. Source text in content/releases.md; add an entry in the same commit as the change. */
export default function ReleasesPage() {
  const md = readFileSync(path.join(process.cwd(), "content/releases.md"), "utf8");
  return <LegalPage markdown={md} />;
}
