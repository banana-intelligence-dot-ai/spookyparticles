import type { ReactNode } from "react";
import { SECTION_GAP, SectionHead } from "./section-head";

/** One line each. The longer answers are in the questions below and in the privacy policy. */
const ACCESS: [string, string][] = [
  ["Vercel integration", "Reads the projects you choose, under Vercel's own scopes."],
  ["Vercel read token", "GET requests plus one read-only history query. Revoke it at Vercel any time."],
  ["GitHub", "Read-only metadata and deployments, on the repos you choose."],
  ["Your agent", "A key you make. It reads by default and can never delete or see a secret."],
  ["Your data", "Tokens are encrypted. Secret values are never stored. Nothing in your accounts is deleted."],
];

export function Trust() {
  return (
    <section aria-labelledby="trust" className={`${SECTION_GAP} grid gap-10 lg:grid-cols-12 lg:gap-x-6`}>
      <SectionHead
        id="trust"
        eyebrow="Access"
        title="What each connection can read."
        sub="Vercel limits the integration to projects you pick. Our code keeps a pasted token read-only."
        className="lg:col-span-5"
      />
      <dl className="lg:col-span-6 lg:col-start-7">
        {ACCESS.map(([what, line]) => (
          <div key={what} className="grid gap-x-6 gap-y-1 border-b border-line-1 py-5 first:border-t sm:grid-cols-[168px_minmax(0,1fr)]">
            <dt className="font-mono text-[14px] text-fg">{what}</dt>
            <dd className="max-w-[52ch] text-[14px] leading-[1.55] text-pretty text-fg-2 sm:text-[16px]">{line}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const QUESTIONS: [string, ReactNode][] = [
  ["What happens when a schedule misses?", "With a read token, we alert your phone, Slack, Teams or email. We also tell you when the job recovers."],
  ["Can the integration watch schedules?", "The integration lists schedules and their timing. Add one check-in line or a read token to watch runs."],
  [
    "Can it change my projects?",
    "No. GitHub and Vercel connections only read. An agent key can write to Spooky if you choose, but cannot delete anything or see a secret.",
  ],
  ["Does it watch other hosts?", "Check-ins watch scheduled jobs anywhere. Other hosts appear in the map through deploy data."],
  ["What does my agent get?", "A key that reads by default. You can allow it to add jobs and alert channels, start a sync and mark findings."],
  [
    "Where can I read the details?",
    <>
      <a href="/privacy" className="text-fg underline decoration-line-2 underline-offset-4 hover:decoration-fg">
        The privacy policy
      </a>{" "}
      lists the data we keep and your choices.
    </>,
  ],
];

export function Faq() {
  return (
    <section aria-labelledby="faq" className={SECTION_GAP}>
      <SectionHead id="faq" eyebrow="Questions" title="Asked before connecting." />
      <div className="mt-12 max-w-[720px]">
        {QUESTIONS.map(([q, a]) => (
          <details key={q} className="group border-b border-line-1 first:border-t">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-left text-[16px] leading-[1.4] text-fg [&::-webkit-details-marker]:hidden">
              <span className="text-pretty">{q}</span>
              <svg
                viewBox="0 0 16 16"
                className="size-4 shrink-0 text-fg-3 motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path d="M3.5 6 8 10.5 12.5 6" />
              </svg>
            </summary>
            <p className="max-w-[60ch] pb-6 text-[14px] leading-[1.6] text-pretty text-fg-2 sm:text-[16px]">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
