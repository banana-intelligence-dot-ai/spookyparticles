import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel deployment notifications: how to set up";
const DESCRIPTION =
  "Set up Vercel deployment failure notifications for web and email, then use push, SMS, webhooks, or Spooky where each one fits.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-deployment-notifications" },
};

const FAQ = [
  ["How do I get notified when a Vercel deployment fails?", "Notifications are available on all plans. Web and email are on by default for deployment failures, and Vercel sends the alert to the deployment's creator."],
  ["How do I change where Vercel sends deployment notifications?", "Select your team. Open Settings in the sidebar. Under Account, choose My Notifications. Toggle where you want to receive each notification type. Your changes affect only you, and you cannot configure notifications for other team members."],
  ["Can I turn off all Vercel notifications?", "Not for critical notifications. You can opt out of one channel, such as email, but you cannot turn off both email and web for a critical notification."],
  ["Does Vercel send both a dashboard and an email notification?", "Web and email are both on by default for deployment failures. If you read a failure notification in the dashboard before Vercel sends the email, Vercel does not send that email."],
  ["What about push or SMS?", "Push notifications are opt-in for each device and are available on desktop and mobile web. SMS notifications are available per user only for Spend Management."],
  ["How do I get notified of other deployment events?", "Use Vercel Webhooks for other deployment events."],
  ["Where does Spooky fit?", "Spooky Particles watches your Vercel projects, alerts you on ntfy or email when a production deploy fails, and passes the build log line to your coding agent, Claude Code or Codex, so the agent starts with the likely cause, when Spooky can find it. The agent writes the fix. Spooky never changes your code itself and never merges anything."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-deployment-notifications.md. Keep FAQ in step with it. */
export default function VercelDeploymentNotificationsPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-deployment-notifications.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
