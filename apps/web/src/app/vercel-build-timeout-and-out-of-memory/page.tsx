import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel Build Timeout and Out of Memory: Fixes";
const DESCRIPTION =
  "Fix a Vercel build timeout or out of memory error by finding slow build steps, moving work to CI, trimming dependencies, or adding memory.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-build-timeout-and-out-of-memory" },
};

const FAQ = [
  ["Why does my Vercel build time out?", "A Vercel build times out when too much work happens during the build, the work does not scale, or a step stalls or lacks a timeout. Vercel enforces a maximum Build Step duration of 45 minutes on Hobby, Pro and Enterprise plans, then interrupts the step and fails the deployment."],
  ["Why does my Vercel build run out of memory?", "A Vercel build runs out of memory when it uses more than the 8192 MB allocated to its build container. Vercel may throw a SIGKILL or out of memory error, or the build may stall until it times out."],
  ["How do I find what is slowing my build?", "Open the project, select Observability, and use Build Diagnostics to compare build duration and resource usage for each deployment. Read the build logs alongside those measurements to identify the slow step."],
  ["How do I fix a build timeout?", "Reduce the work done during the Build Step, bound any parallel work, and move checks or generated artifacts that do not need to block deployment into CI. Keep the work that produces the deployable application in the build."],
  ["How do I fix an out of memory build?", "Reduce the build's memory demand first, then use a larger build machine when the project still needs more capacity. Check dependencies and assets before increasing memory."],
  ["Where does Spooky fit?", "A build that is killed or times out is a failed deployment. Spooky Particles alerts you on ntfy or email when a production deploy fails, and passes the build log line to your coding agent, Claude Code or Codex, when Spooky can find it. The agent writes the fix. Spooky never changes your code itself and never merges anything."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-build-timeout-and-out-of-memory.md. Keep FAQ in step with it. */
export default function VercelBuildLimitsPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-build-timeout-and-out-of-memory.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
