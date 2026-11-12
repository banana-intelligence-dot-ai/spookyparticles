import { Suspense } from "react";
import { Footer, Wordmark } from "@/components/brand";
import { CopyButton } from "@/components/copy-button";
import { EntangledWeb } from "./_landing/entangled-web";
import { SignalTrace } from "./_landing/signal-trace";
import { ReceiptCard } from "./_landing/receipt-card";
import { TraceGlyph } from "./_landing/trace-glyph";
import { Heartbeat } from "./_landing/heartbeat";
import { SignInNotice } from "./_landing/signin-notice";
import { SECTION_GAP, SectionHead } from "./_landing/section-head";
import { Faq, Trust } from "./_landing/trust";
import { SignIn } from "./sign-in";
import { vercelSignInConfig } from "@/lib/env";

/** A name and one short line each. Every claim here is live; the conditions live in the questions below. */
const PILLARS: [string, string, "uptime" | "schedule" | "deploy" | "check"][] = [
  ["Uptime", "Every live site is checked every 5 minutes. Two misses and your phone knows.", "uptime"],
  ["Schedules", "Every Vercel schedule, listed. With a read token, a missed or failed run alerts you.", "schedule"],
  ["Failed deploys", "The alert carries the build log line that names the cause.", "deploy"],
  ["The check", "Five checks per project, from open preview links to a key left in public code.", "check"],
];

const AGENT_PROMPT = "Fetch and follow the instructions at https://spookyparticles.com/setup.md to set up Spooky Particles for me.";

/** WebSite JSON-LD so search shows the brand, not the domain. The names match the title tag. */
const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Spooky Particles",
  alternateName: ["spooky particles", "spookyparticles.com"],
  url: "https://spookyparticles.com/",
  description: "Vercel runs your apps. Spooky Particles tells you when a schedule or deploy breaks.",
  publisher: {
    "@type": "Organization",
    name: "Banana Intelligence LLC",
    url: "https://bananaintelligence.ai",
  },
};

export default function Landing() {
  const vercelEnabled = Boolean(vercelSignInConfig());
  return (
    <div className="field relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(WEBSITE_LD).replace(/</g, "\\u003c"),
        }}
      />
      <div className="relative z-[1] mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-8">
        <header className="flex min-h-16 items-center gap-6 py-3">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <Wordmark />
            <span aria-hidden className="hidden h-4 w-px bg-line-2 sm:block" />
            <p className="text-[14px] leading-[1.3] text-fg-2">For people who deploy on Vercel.</p>
          </div>
          <nav aria-label="Site" className="ml-auto hidden items-center gap-1 text-[14px] text-fg-2 sm:flex">
            <a href="/releases" className="inline-flex h-11 items-center px-3 hover:text-fg">Releases</a>
            <a href="/setup.md" className="inline-flex h-11 items-center px-3 hover:text-fg">For agents</a>
          </nav>
        </header>

        <main className="flex flex-1 flex-col pb-32 sm:pb-48">
          <section className="relative isolate pt-10 sm:pt-14">
            <h1 className="text-[clamp(32px,8.6vw,84px)] leading-[1.02] font-semibold tracking-[-0.045em] text-fg">
              <span className="block">Vercel runs your apps.</span>
              <span className="block">Know when one breaks.</span>
            </h1>
            <div className="relative z-10 mt-6 flex max-w-[480px] flex-col gap-8 sm:mt-8">
              <p className="max-w-[460px] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:text-[18px]">
                Missed schedules, failed deploys, and apps still elsewhere. <span className="whitespace-nowrap">Read-only</span> alerts reach your phone.
              </p>
              <div>
                <Suspense fallback={null}>
                  <SignInNotice />
                </Suspense>
                <SignIn large vercelEnabled={vercelEnabled} />
                <p className="mt-3 text-[13px] text-fg-3">Read-only. Revoke any time. Never deletes anything.</p>
              </div>
            </div>
            {/* From 1280 px the trace starts level with the sentence, so the failure rises beside it. */}
            <div className="relative left-1/2 mt-14 w-screen -translate-x-1/2 sm:mt-12 xl:-mt-[196px]">
              <SignalTrace />
            </div>
          </section>

          <section aria-labelledby="agent" className={`${SECTION_GAP} grid gap-10 lg:grid-cols-12 lg:gap-x-6`}>
            <SectionHead
              id="agent"
              eyebrow="Agent"
              title="Or let your agent set it up."
              sub="Paste this into Claude Code, Cursor or any coding agent."
              className="lg:col-span-5"
            />
            <div className="lg:col-span-6 lg:col-start-7 lg:pt-10">
              <div className="slab flex items-start gap-1 rounded-lg py-3 pr-1.5 pl-4">
                <code className="min-w-0 flex-1 font-mono text-[13px] leading-[1.6] [overflow-wrap:anywhere] text-code sm:text-[14px]">{AGENT_PROMPT}</code>
                <CopyButton value={AGENT_PROMPT} label="Copy the setup prompt" />
              </div>
            </div>
          </section>

          <section aria-labelledby="watch" className={SECTION_GAP}>
            <SectionHead id="watch" eyebrow="Watch" title="What it watches." />
            <ul className="mt-12 grid gap-x-8 gap-y-10 border-t border-line-1 pt-8 sm:grid-cols-2 lg:grid-cols-4">
              {PILLARS.map(([name, line, kind]) => (
                <li key={name}>
                  <TraceGlyph kind={kind} />
                  <h3 className="mt-5 text-[16px] font-medium text-fg">{name}</h3>
                  <p className="mt-2 max-w-[34ch] text-[14px] leading-[1.6] text-pretty text-fg-2">{line}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="map" className={SECTION_GAP}>
            <SectionHead
              id="map"
              eyebrow="Map"
              title="Your projects, wired together."
              sub="Vercel projects, GitHub repos, Actions runs, domains and deploy commits."
              className="mb-12"
            />
            <EntangledWeb />
          </section>

          <section aria-labelledby="source" className={`${SECTION_GAP} grid gap-10 lg:grid-cols-12 lg:gap-x-6`}>
            <SectionHead id="source" eyebrow="Deploys" title="See why a deploy failed." sub="The email names the line that broke the build. This one was ours." className="lg:col-span-5" />
            <div className="lg:col-span-6 lg:col-start-7">
              <ReceiptCard />
            </div>
          </section>

          <Trust />
          <Faq />

          <div className={`${SECTION_GAP} relative left-1/2 w-screen -translate-x-1/2`}>
            <Heartbeat />
          </div>

          <section aria-labelledby="start" className="mt-16 sm:mt-20">
            <SectionHead id="start" eyebrow="Start" title="Watch your Vercel projects." />
            <div className="mt-10">
              <SignIn large vercelEnabled={vercelEnabled} />
            </div>
            <div className="mt-20 max-w-[64ch] space-y-2 text-[13px] leading-[1.6] text-pretty text-fg-3">
              <p>Named for Einstein’s “spooky action at a distance,” two particles that answer each other at any distance. Your projects do the same.</p>
              <p>
                VibeOps is keeping your shipped apps in view.{" "}
                <a href="/vibeops" className="text-fg-2 underline decoration-line-2 underline-offset-4 hover:text-fg hover:decoration-fg">
                  What the word means
                </a>
              </p>
            </div>
          </section>
        </main>

        <footer className="flex h-16 items-center border-t border-line-1">
          <Footer />
          <p className="ml-auto text-[12px] text-fg-3">Not affiliated with Vercel. Vercel is a trademark of Vercel Inc.</p>
        </footer>
      </div>
    </div>
  );
}
