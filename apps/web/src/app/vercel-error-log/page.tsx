import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel error log: where to find it";
const DESCRIPTION =
  "Find Vercel build and runtime error logs in the dashboard or CLI, filter 5xx requests, and route failures to your coding agent.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-error-log" },
};

const FAQ = [
  ["Where do I find the Vercel error log?", "Open the project and use its Logs tab for runtime activity, or open a deployment to read its build log. Runtime logs are searched at project level in the dashboard's deployments section, while build output belongs to a specific deployment."],
  ["How do I query production errors with the CLI?", "Use vercel logs with filters for the production environment, HTTP status, error level, or request ID. Request records carry HTTP status, while runtime messages must be queried separately."],
  ["How do I read a deployment's build log?", "Run vercel list --environment production to find the deployment, then run vercel inspect with the deployment URL and --logs. Build logs are available on all plans."],
  ["How long are Vercel logs available?", "Runtime logs are available on all plans. Retention and how far back vercel logs can query depend on the plan and Observability Plus. For longer storage, use Log Drains on Pro and Enterprise plans."],
  ["Where does Spooky fit?", "Spooky Particles alerts you on ntfy or email. For a failed production deploy it passes the build log line to Claude Code or Codex when it can find one. For runtime errors it tells the agent when server errors rise in project request history, where it can read that history, but does not pass a log line. The agent writes the fix. Spooky never changes your code."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-error-log.md. Keep FAQ in step with it. */
export default function VercelErrorLogPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-error-log.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
