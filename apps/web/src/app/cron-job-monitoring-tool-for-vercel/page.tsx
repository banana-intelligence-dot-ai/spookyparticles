import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Cron job monitoring tool for Vercel and other jobs";
const DESCRIPTION =
  "Compare how cron monitors learn a job ran, then monitor Vercel cron jobs or add a check-in to GitHub Actions, launchd, and plain cron.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/cron-job-monitoring-tool-for-vercel" },
};

const FAQ = [
  ["How does a cron monitor know a job ran?", "A cron monitor learns about a run in one of two ways. It reads the platform's request history, or the job sends a check-in when it finishes. The first path needs a platform whose request history the monitor can read. The second path works for a scheduled job that can call a link when its work is done."],
  ["What should I look for in a cron job monitoring tool?", "Ask four short questions. Does it learn of a run without you editing every job? Does it alert on a late or missed run and on recovery? Does it tell your coding agent, not just you? Does it cover jobs outside one platform?"],
  ["How does Spooky watch Vercel cron jobs?", "Spooky reads your Vercel project's cron list. Where it can read the request history, it watches each run without a code change. It alerts when a run is missed or fails, and again when it recovers."],
  ["How do I monitor GitHub Actions, launchd or plain cron?", "Add a check-in at the end of the job, after its own success check. Create the job with periodMinutes, or with a cron schedule and timeZone, plus graceMinutes for how late is still fine."],
  ["Where does Spooky fit?", "Spooky finds your Vercel cron jobs and alerts when a run is missed or fails, and again when it recovers. Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent proposes the fix for you to review."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/cron-job-monitoring-tool-for-vercel.md. Keep FAQ in step with it. */
export default function CronJobMonitoringToolForVercelPage() {
  const md = readFileSync(path.join(process.cwd(), "content/cron-job-monitoring-tool-for-vercel.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
