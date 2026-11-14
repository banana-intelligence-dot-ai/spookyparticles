import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Footer, Wordmark } from "@/components/brand";
import { Particles } from "./_landing/particles";
import { PastePrompt } from "./_landing/paste-prompt";
import { SignInNotice } from "./_landing/signin-notice";
import { SignIn } from "./sign-in";
import { vercelSignInConfig } from "@/lib/env";

/**
 * Every line of homepage copy lives here, so the headline can change in one edit.
 * One screen, Hex-style: every word and element earns its place. The hero is the name:
 * Einstein's entangled pair, your app and your agent. Claim only what is live.
 */
const COPY = {
  title: "Spooky Particles: your app breaks, your agent fixes it",
  description:
    "Your app breaks, your coding agent fixes it. Spooky pages your agent first, checks the fix, and pages you only if it can’t.",
  quote: "“spooky action at a distance”",
  quoteSource: "Einstein, 1947",
  h1: ["Fixed by the time", "you realize it’s broken."],
  sub: "Your coding agent gets paged first. You hear about it only if it can’t fix it.",
  fixKicker: "A real fix, from our own site",
  how: [
    { h: "Your agent is paged first.", p: "A deploy fails, a page stops answering, or a scheduled job goes quiet. Spooky checks every 5 minutes and sends your coding agent the cause. It fixes, tests and ships." },
    { h: "You’re paged only if it’s still broken.", p: "Fixed means the check passes again. If it doesn’t, Spooky pages you on your phone, Slack, Teams or email." },
    { h: "Every fix is tracked.", p: "Each break, page and fix is kept, so you see what healed itself and what needed you." },
  ],
  setupH: "Three things to connect.",
  setup: ["Vercel", "GitHub", "Your agent"],
  reassure: "Read-only. Never deletes anything. Revoke any time.",
  fixesH: "Real fixes",
  fixes: [
    { date: "Nov 9", what: "Production deploy failed on Vercel", tag: "", took: "9 min 48 s" },
    { date: "Nov 14", what: "A page broken on purpose on a test site", tag: "drill", took: "7 min, no human" },
  ],
  agentLink: "Or give your agent setup.md",
} as const;

const AGENT_PROMPT = "Fetch and follow the instructions at https://spookyparticles.com/setup.md to set up Spooky Particles for me.";

export const metadata: Metadata = {
  title: { absolute: COPY.title },
  description: COPY.description,
  openGraph: { siteName: "spooky particles", type: "website", url: "./", title: COPY.title, description: COPY.description },
  twitter: { card: "summary_large_image", title: COPY.title, description: COPY.description },
};

/** Dark is the brand, and the hero is glass in a dark room, so this page stays dark. */
export const viewport: Viewport = {
  themeColor: "#070707",
  colorScheme: "dark",
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

function WaysIn({ vercelEnabled }: { vercelEnabled: boolean }) {
  return (
    <div className="flex w-full flex-col items-stretch gap-2.5 min-[821px]:w-auto min-[821px]:flex-row min-[821px]:flex-wrap min-[821px]:items-center min-[821px]:justify-center">
      <SignIn large ink inline vercelEnabled={vercelEnabled} />
      <PastePrompt prompt={AGENT_PROMPT} />
    </div>
  );
}

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
      <header className="relative z-[1] mx-auto flex w-full max-w-[1216px] items-center px-4 py-4 sm:px-12 sm:py-6">
        <Wordmark />
      </header>

      <main className="relative z-[1] flex flex-1 flex-col">
        {/* First screen: Einstein, the line, two ways in. Nothing else. */}
        <section className="hero relative mx-auto flex min-h-[78dvh] w-full max-w-[1216px] flex-col items-center justify-center px-4 pb-24 text-center sm:px-12">
          <div className="hero-portrait" aria-hidden />
          <div className="hero-scrim" aria-hidden />
          <p className="relative font-mono text-[12.5px] leading-[1.5] text-fg-2">
            {COPY.quote}
            <span className="ml-2.5 text-fg-3">{COPY.quoteSource}</span>
          </p>
          <h1 className="relative mt-7 text-[38px] leading-[1.04] font-medium tracking-[-0.025em] text-fg min-[821px]:mt-9 min-[821px]:text-[64px] min-[821px]:leading-[1.02]">
            {COPY.h1[0]} <span className="block text-fg-2">{COPY.h1[1]}</span>
          </h1>
          <p className="relative mt-4 max-w-[30ch] text-[16px] leading-[1.55] text-pretty text-fg-2 min-[821px]:mt-5 min-[821px]:max-w-none min-[821px]:text-[17px]">
            {COPY.sub}
          </p>
          <div className="relative mt-7 w-full min-[821px]:mt-9 min-[821px]:w-auto">
            <Suspense fallback={null}>
              <SignInNotice />
            </Suspense>
            <WaysIn vercelEnabled={vercelEnabled} />
          </div>
        </section>

        {/* Just below: the pair, playing a real fix. */}
        <section aria-labelledby="fix-h" className="fix-stage">
          <Particles title={COPY.fixKicker} titleId="fix-h" />
        </section>

        <div className="mx-auto w-full max-w-[672px] px-4 pb-28 sm:px-4">
          <section aria-label="How it works" className="flex flex-col gap-10">
            {COPY.how.map((s) => (
              <div key={s.h}>
                <h3 className="text-[20px] leading-[1.3] font-medium tracking-[-0.01em] text-fg">{s.h}</h3>
                <p className="mt-2 text-[16px] leading-[1.65] text-pretty text-fg-2">{s.p}</p>
              </div>
            ))}
          </section>

          <section aria-labelledby="fixes-h" className="mt-24">
            <h2 id="fixes-h" className="text-[20px] font-medium tracking-[-0.01em] text-fg">
              {COPY.fixesH}
            </h2>
            <ul className="mt-5 border-t border-line-1">
              {COPY.fixes.map((f) => (
                <li key={f.date} className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-1 border-b border-line-1 py-4 text-[15px] tabular-nums min-[821px]:grid-cols-[72px_1fr_auto]">
                  <span className="font-mono text-[13px] leading-[1.7] text-fg-3">{f.date}</span>
                  <span className="text-fg">
                    {f.what}
                    {f.tag ? <span className="ml-2 rounded-full border border-line-2 px-2 py-0.5 font-mono text-[11px] text-fg-3">{f.tag}</span> : null}
                  </span>
                  <span className="col-start-2 font-mono text-[13px] leading-[1.7] text-accent min-[821px]:col-start-3">{f.took}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="setup-h" className="mt-24">
            <h2 id="setup-h" className="text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-fg min-[821px]:text-[34px]">
              {COPY.setupH}
            </h2>
            <p className="mt-3 font-mono text-[13px] text-fg-2">{COPY.setup.join("  ·  ")}</p>
            <div className="mt-8 flex flex-col items-start gap-3">
              <SignIn large ink inline vercelEnabled={vercelEnabled} />
              <a href="/setup.md" className="inline-flex min-h-11 items-center whitespace-nowrap text-[15px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
                {COPY.agentLink}
              </a>
            </div>
            <p className="mt-5 font-mono text-[12px] text-fg-3">{COPY.reassure}</p>
          </section>
        </div>
      </main>

      <footer className="relative z-[1] mx-auto flex w-full max-w-[1216px] flex-col gap-1 px-4 pb-6 font-mono text-[12px] text-fg-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:px-12">
        <Footer className="text-[12px]" />
        <nav aria-label="Site" className="flex gap-4 sm:ml-auto">
          <a href="/setup.md" className="hover:text-fg">For agents</a>
          <a href="/releases" className="hover:text-fg">Releases</a>
          <a href="/vibeops" className="hover:text-fg">VibeOps</a>
        </nav>
        <p>Not affiliated with Vercel.</p>
      </footer>
    </div>
  );
}
