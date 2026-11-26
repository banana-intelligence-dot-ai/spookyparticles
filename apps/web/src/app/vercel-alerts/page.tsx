import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel Alerts: what they cover and how to set up";
const DESCRIPTION =
  "What Vercel Alerts watch, which plans include them, and how to get one by email, Slack or webhook. Plus how Spooky covers failed deploys and quiet cron jobs.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-alerts" },
};

const FAQ = [
  ["What are Vercel Alerts?", "Alerts tell you when Vercel sees something unusual in a project, so you can respond quickly. Vercel sends them by email, through Slack, or to a webhook."],
  ["What does Vercel alert on?", "By default, Vercel notifies you about usage anomalies and error anomalies. An error anomaly fires when a route's five-minute error count is unusually high against its recent baseline. By default it tracks 5xx status codes."],
  ["How do I get a Vercel alert by email, Slack or webhook?", "Open Settings, then Alerts, for your team. Click Add Monitor, pick Error anomaly or Usage anomaly, name the monitor, choose the projects, then choose the lowest severity that should notify you and the destinations. Vercel always includes Critical alerts."],
  ["Which plans include Vercel Alerts?", "Vercel lists Alerts as available on Enterprise and Pro plans with Observability Plus. After you turn on Observability Plus, error anomalies start after 24 hours and usage anomalies after 3 days."],
  ["Do Vercel Alerts catch a failed deploy or a quiet cron job?", "Vercel's anomaly alerts watch errors and usage on running projects. For a failed deployment, see Vercel deployment notifications. For scheduled jobs, see Vercel cron job monitoring."],
  ["Where does Spooky fit?", "Spooky Particles alerts you on ntfy or email when a production deploy fails or a cron job goes quiet, and passes the build log line to your coding agent, Claude Code or Codex, so the agent starts with the likely cause, when Spooky can find it. The agent writes the fix. Spooky never changes your code itself and never merges anything."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-alerts.md. Keep FAQ in step with it. */
export default function VercelAlertsPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-alerts.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
