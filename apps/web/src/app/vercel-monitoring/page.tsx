import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel monitoring: what to watch";
const DESCRIPTION =
  "What to monitor on a Vercel app: deploys, cron jobs, uptime and server errors, with a guide for each and Vercel's own tools.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-monitoring" },
};

const FAQ = [
  ["What should I monitor on a Vercel app?", "Monitor deploys, cron jobs, whether the site answers and server errors. Each signal points to a different kind of problem and a more focused next step. The pages in this table explain what to inspect for each one."],
  ["What does Vercel give me for monitoring?", "Vercel Observability finds production errors, captures request traces, and has queryable metrics from the dashboard or Vercel CLI. See Vercel's Observability documentation for these tools."],
  ["Where does Spooky fit?", "Spooky watches deploys and whether the site answers, and tells you when one goes wrong. Cron jobs and server errors need readable Vercel request history, or a check-in for a cron job."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-monitoring.md. Keep FAQ in step with it. */
export default function VercelMonitoringPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-monitoring.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
