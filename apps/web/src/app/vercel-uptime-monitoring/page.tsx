import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel uptime monitoring: get alerted";
const DESCRIPTION =
  "Vercel alerts watch your traffic, not your site from outside. See what an outside uptime check does, and how Spooky checks every 5 minutes.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-uptime-monitoring" },
};

const FAQ = [
  ["How do I monitor uptime on a Vercel site?", "Use something outside your app that asks for the page again and again and tells you when it stops answering. Vercel's own alerts watch error counts in your traffic from the inside, and are available on Enterprise and Pro plans with Observability Plus."],
  ["What does Spooky check?", "Spooky checks your live Vercel site every 5 minutes and alerts when it stops answering or answers with an error. It waits for two failed checks in a row, so one blip does not page you. A site behind a login (401 or 403) is not counted as down."],
  ["What is uptime monitoring?", "Uptime monitoring is a check, made again and again from outside, that your site still answers. When it stops, you get an alert."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-uptime-monitoring.md. Keep FAQ in step with it. */
export default function VercelUptimeMonitoringPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-uptime-monitoring.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
