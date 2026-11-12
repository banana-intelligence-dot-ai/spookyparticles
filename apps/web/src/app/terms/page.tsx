import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "./legal-page";

export const metadata: Metadata = { title: "Terms of service", description: "The rules for using Spooky Particles: read-only access, your data, and our liability." };

export default function TermsPage() {
  const md = readFileSync(path.join(process.cwd(), "content/legal/terms.md"), "utf8");
  return <LegalPage markdown={md} />;
}
