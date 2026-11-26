import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel cron job not running: fixes";
const DESCRIPTION =
  "Fix a Vercel cron job that is not running by checking production, route path, schedule limits, CRON_SECRET, logs, firewall rules, and build output.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-cron-job-not-running" },
};

const FAQ = [
  ["Why is my Vercel cron job not running?", "Check that the job is on a production deployment, its path matches a deployed route, the schedule and plan limits permit the run, and CRON_SECRET matches the Authorization header. Then check for redirects, cached responses, WAF rules, or a build that did not register the job."],
  ["Where does Spooky fit?", "Spooky finds Vercel cron jobs and alerts you when a run is missed or fails, and again when it recovers. Where it can't read the project's request history on Vercel, one check-in line in the job turns watching on. It tells your coding agent what broke, and the agent proposes the fix."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-cron-job-not-running.md. Keep FAQ in step with it. */
export default function VercelCronJobNotRunningPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-cron-job-not-running.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
