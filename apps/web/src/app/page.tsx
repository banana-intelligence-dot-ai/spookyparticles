import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Footer, Wordmark } from "@/components/brand";
import { CopyButton } from "@/components/copy-button";
import { AgentInbox } from "./_landing/agent-inbox";
import { SignalTrace } from "./_landing/signal-trace";
import { TraceGlyph, type GlyphKind } from "./_landing/trace-glyph";
import { Heartbeat } from "./_landing/heartbeat";
import { SignInNotice } from "./_landing/signin-notice";
import { SECTION_GAP, SectionHead } from "./_landing/section-head";
import { Faq, Trust } from "./_landing/trust";
import { SignIn } from "./sign-in";
import { vercelSignInConfig } from "@/lib/env";

/**
 * Every line of homepage copy lives here, so the headline can change in one edit.
 * Source: docs/positioning/2026-11-12-agent-pings.md (v2). Claim only what is live.
 */
const COPY = {
  title: "Spooky Particles: your coding agent gets the evidence",
  description:
    "When an app you shipped quietly stops, Spooky Particles tells your phone and gives your coding agent the evidence. Read-only, for people who deploy on Vercel.",
  tagline: "For people who deploy on Vercel.",
  /** Two lines on desktop, split where the sentence turns. */
  h1: ["When an app you shipped quietly stops,", "your coding agent gets the evidence."],
  sub: "Spooky checks every Vercel deploy and schedule every 5 minutes. Your phone hears in minutes. Claude Code sees what broke, and why, the next time you open it.",
  reassure: "Read-only. Revoke any time. Never deletes anything.",
  loop: { title: "From quiet failure to working again." },
  pillars: [
    { name: "Notice", line: "Every Vercel deploy and schedule, checked every 5 minutes.", glyph: "schedule" },
    { name: "Hand off", line: "Your phone hears in minutes. Claude Code sees it at your next session, and any MCP agent can ask.", glyph: "handoff" },
    { name: "Confirm", line: "Spooky keeps checking and tells you when it’s working again.", glyph: "confirm" },
  ] satisfies { name: string; line: string; glyph: GlyphKind }[],
  /** The one line outcome checks get, marked new: they ship with this page. */
  fresh: { mark: "New", line: "Outcome checks read the answer too, like “date is today, sentCount at least 1”." },
  agent: {
    title: "What your agent sees.",
    sub: "The problem and the line that caused it, where your agent looks first.",
    prompt: "Set it up with one prompt. Paste it into Claude Code, Cursor or any coding agent.",
  },
  start: { title: "Watch what you shipped." },
} as const;

const AGENT_PROMPT = "Fetch and follow the instructions at https://spookyparticles.com/setup.md to set up Spooky Particles for me.";

export const metadata: Metadata = {
  title: { absolute: COPY.title },
  description: COPY.description,
  openGraph: { siteName: "spooky particles", type: "website", url: "./", title: COPY.title, description: COPY.description },
  twitter: { card: "summary_large_image", title: COPY.title, description: COPY.description },
};

/** Dark is the brand; light follows the visitor's setting on this page. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070707" },
    { media: "(prefers-color-scheme: light)", color: "#efeee9" },
  ],
  colorScheme: "dark light",
};

/** WebSite JSON-LD so search shows the brand, not the domain. The names match the title tag. */
const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Spooky Particles",
  alternateName: ["spooky particles", "spookyparticles.com"],
  url: "https://spookyparticles.com/",
  description: COPY.description,
  publisher: {
    "@type": "Organization",
    name: "Banana Intelligence LLC",
    url: "https://bananaintelligence.ai",
  },
};

export default function Landing() {
  const vercelEnabled = Boolean(vercelSignInConfig());
  return (
    <div data-theme="system" className="field relative isolate flex min-h-dvh flex-col overflow-x-clip">
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
            <p className="text-[14px] leading-[1.3] text-fg-2">{COPY.tagline}</p>
          </div>
          <nav aria-label="Site" className="ml-auto hidden items-center gap-1 text-[14px] text-fg-2 sm:flex">
            <a href="/releases" className="inline-flex h-11 items-center px-3 hover:text-fg">Releases</a>
            <a href="/setup.md" className="inline-flex h-11 items-center px-3 hover:text-fg">For agents</a>
          </nav>
        </header>

        <main className="flex flex-1 flex-col pb-24 sm:pb-32">
          <section className="relative isolate pt-10 sm:pt-14">
            <h1 className="text-[clamp(34px,6vw,60px)] leading-[1.06] font-semibold tracking-[-0.045em] text-balance text-fg lg:[text-wrap:wrap]">
              {COPY.h1.map((line) => (
                <span key={line} className="lg:block">
                  {line}{" "}
                </span>
              ))}
            </h1>
            <div className="relative z-10 mt-6 flex max-w-[480px] flex-col gap-8 sm:mt-8">
              <p className="max-w-[460px] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:text-[18px]">{COPY.sub}</p>
              <div>
                <Suspense fallback={null}>
                  <SignInNotice />
                </Suspense>
                <SignIn large vercelEnabled={vercelEnabled} />
                <p className="mt-3 text-[13px] text-fg-3">{COPY.reassure}</p>
              </div>
            </div>
            {/* From 1280 px the trace starts level with the sentence, so the failure rises beside it. */}
            <div className="relative left-1/2 mt-14 w-screen -translate-x-1/2 sm:mt-12 xl:-mt-[196px]">
              <SignalTrace />
            </div>
          </section>

          <section aria-labelledby="loop" className={`${SECTION_GAP} grid gap-10 lg:grid-cols-12 lg:gap-x-6`}>
            <SectionHead id="loop" title={COPY.loop.title} className="lg:col-span-5" />
            <div className="lg:col-span-6 lg:col-start-7">
              <dl>
                {COPY.pillars.map((p) => (
                  <div key={p.name} className="grid gap-x-6 gap-y-3 border-b border-line-1 py-6 first:border-t sm:grid-cols-[168px_minmax(0,1fr)]">
                    <dt className="flex flex-col gap-3">
                      <TraceGlyph kind={p.glyph} />
                      <span className="text-[20px] font-medium tracking-[-0.01em] text-fg">{p.name}</span>
                    </dt>
                    <dd className="max-w-[46ch] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:pt-10">{p.line}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-[14px] leading-[1.6] text-pretty text-fg-2">
                <a href="/releases" className="font-mono text-[12px] mr-2 text-accent uppercase hover:underline">{COPY.fresh.mark}</a>
                {COPY.fresh.line}
              </p>
            </div>
          </section>

          <section aria-labelledby="agent" className={`${SECTION_GAP} grid gap-10 lg:grid-cols-12 lg:gap-x-6`}>
            <div className="lg:col-span-5">
              <SectionHead id="agent" title={COPY.agent.title} sub={COPY.agent.sub} />
              <p className="mt-10 text-[14px] leading-[1.6] text-fg-2">{COPY.agent.prompt}</p>
              <div className="slab mt-3 flex items-start gap-1 rounded-lg py-3 pr-1.5 pl-4">
                <code className="min-w-0 flex-1 font-mono text-[13px] leading-[1.6] [overflow-wrap:anywhere] text-code">{AGENT_PROMPT}</code>
                <CopyButton value={AGENT_PROMPT} label="Copy the setup prompt" />
              </div>
            </div>
            <div className="lg:col-span-6 lg:col-start-7 lg:pt-10">
              <AgentInbox />
            </div>
          </section>

          <Trust />
          <Faq />

          <div className={`${SECTION_GAP} relative left-1/2 w-screen -translate-x-1/2`}>
            <Heartbeat />
          </div>

          <section aria-labelledby="start" className="mt-16 sm:mt-20">
            <SectionHead id="start" title={COPY.start.title} />
            <div className="mt-10">
              <SignIn large vercelEnabled={vercelEnabled} />
            </div>
            <div className="mt-16 max-w-[64ch] space-y-2 text-[14px] leading-[1.6] text-pretty text-fg-3">
              <p>Named for Einstein’s “spooky action at a distance,” two particles that answer each other at any distance.</p>
              <p>
                <a href="/vibeops" className="text-fg-2 underline decoration-line-2 underline-offset-4 hover:text-fg hover:decoration-fg">
                  What VibeOps means
                </a>
              </p>
            </div>
          </section>
        </main>

        <footer className="flex flex-col gap-2 border-t border-line-1 py-5 sm:h-16 sm:flex-row sm:items-center sm:py-0">
          <Footer />
          <p className="text-[12px] text-fg-3 sm:ml-auto">Not affiliated with Vercel. Vercel is a trademark of Vercel Inc.</p>
        </footer>
      </div>
    </div>
  );
}
