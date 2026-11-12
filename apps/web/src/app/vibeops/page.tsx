import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

export const metadata: Metadata = {
  title: "VibeOps",
  description: "VibeOps is the work of keeping shipped apps running. Watch Vercel schedules and failed deploys, then ask your coding agent what broke.",
};

/** The definition of record. Source text in content/vibeops.md. */
export default function VibeOpsPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vibeops.md"), "utf8");
  return <LegalPage markdown={md} />;
}
