import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "../terms/legal-page";

const TITLE = "Vercel 502 bad gateway: fixes";
const DESCRIPTION =
  "Fix a Vercel 502 with a ROUTER_EXTERNAL_TARGET code by checking your routing, the external target, firewall rules, SSL, and logs.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vercel-502-bad-gateway" },
};

const FAQ = [
  ["What does a Vercel 502 mean?", "A 502 with a ROUTER_EXTERNAL_TARGET code means Vercel's router could not get a good answer from an external target. For ROUTER_EXTERNAL_TARGET_ERROR, Vercel lists incorrect routing configuration and an invalid response from the target as causes, and a target that does not respond within 120 seconds. The connection and handshake codes cover failed connections, SSL handshake problems and timeouts. Other 502 codes exist, such as NO_RESPONSE_FROM_FUNCTION, where a function finished without returning a response."],
  ["How do I fix a Vercel 502 bad gateway?", "Read the error code in the deployment logs. Check your routing configuration, confirm the external target is online and answers a direct request, look for target errors and firewall rules, and for a handshake error check the target's SSL certificate and response time."],
  ["Where does Spooky fit?", "Spooky can tell your coding agent when a site's server errors rise, if it can read that project's request history on Vercel. Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent proposes the fix. Spooky never changes your code itself."],
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

/** Source text in content/vercel-502-bad-gateway.md. Keep FAQ in step with it. */
export default function Vercel502BadGatewayPage() {
  const md = readFileSync(path.join(process.cwd(), "content/vercel-502-bad-gateway.md"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
