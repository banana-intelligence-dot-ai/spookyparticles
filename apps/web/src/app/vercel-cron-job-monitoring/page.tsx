import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel cron job monitoring: missed runs";
const DESCRIPTION =
  "Vercel does not retry a failed cron job, and a run that never arrives leaves no log. See where to look, why runs go missing, and how to get alerted.";
const BASE = "https://spookyparticles.com";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-cron-job-monitoring" },
};

const FAQ = [
  ["How do I see whether a Vercel cron job ran?", "Open the project, select Schedules in the sidebar, then the Cron Jobs tab, and select View Logs for the job. That opens the runtime logs filtered to the job's path. A job that answers with a redirect or a cached response does not show in the logs."],
  ["Why can a Vercel cron job fail without anyone noticing?", "Vercel will not retry a failed cron invocation. Delivery is best effort, so a transient network error can stop a request reaching your function and leave no runtime log. A wrong path gives a 404, redirects are not followed, and a secret mismatch returns 401."],
  ["How does Spooky monitor Vercel cron jobs?", "Spooky finds your Vercel cron jobs and alerts when a run is missed or fails, and again when it recovers. Where it cannot read the project's request history on Vercel, one check-in line in the job turns watching on."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-cron-job-monitoring.md. Keep FAQ in step with it. */
export default function VercelCronJobMonitoringPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-cron-job-monitoring.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
