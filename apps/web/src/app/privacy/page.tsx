import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

export const metadata: Metadata = { title: "Privacy policy", description: "What Spooky Particles reads, keeps and never does with your data." };

export default function PrivacyPage() {
  const md = readFileSync(path.join(process.cwd(), "content/legal/privacy-policy.md"), "utf8");
  return <LegalPage markdown={md} />;
}
