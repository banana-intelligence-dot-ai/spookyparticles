import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Footer, Wordmark } from "@/components/brand";
import { LiveCount, LiveFixes } from "./_landing/live-fixes";
import { Particles } from "./_landing/particles";
import { PastePrompt } from "./_landing/paste-prompt";
import { SignInNotice } from "./_landing/signin-notice";
import { SignIn } from "./sign-in";
import { vercelSignInConfig } from "@/lib/env";
import { VERCEL_ERROR_PAGES } from "@/lib/vercel-error-pages";

/**
 * Every line of homepage copy lives here, so the headline can change in one edit.
 * One screen, Hex-style: every word and element earns its place. The hero is the name:
 * Einstein's entangled pair, your app and your agent. Claim only what is live.
 */
const COPY = {
  title: "Spooky Particles: your app breaks, your agent fixes it",
  description:
    "Spooky Particles watches your Vercel deploys and scheduled jobs around the clock and sends each failure to your coding agent to fix. Free with your own agent.",
  quote: "“spooky action at a distance”",
  quoteSource: "Einstein, 1947",
  h1: ["Fixed by the time", "you realize it’s broken."],
  sub: "When a Vercel deploy fails or a cron job stops, Spooky sends the error to your coding agent and checks the fix is live.",
  free: "Free. Requires your own coding agent. Never deletes anything of yours.",
  watchH: "What it watches",
  watch: [
    { k: "Deploys", v: "A production build fails on Vercel." },
    { k: "Pages", v: "Your site stops answering, or starts throwing server errors." },
    { k: "Scheduled jobs", v: "A cron job fails, or quietly stops running." },
    { k: "Setup risks", v: "A secret key in your public site, open preview links, a cron anyone can trigger." },
  ],
  changeH: "What changes for you",
  before: { k: "Without Spooky", p: "A deploy fails at 2 am. A user tells you in the morning. You dig through logs and paste the error into your agent." },
  after: { k: "With Spooky", p: "Spooky sees it within minutes and hands your agent the error. Turn on the fix job, a GitHub workflow, and the fix can ship before you wake up." },
  setupCost: "Setup is one prompt to your agent. You connect Vercel and GitHub in your browser.",
  setupH: "Three things to connect.",
  setup: ["Vercel", "GitHub", "Your agent"],
  reassure: "Reads your accounts. Never deletes anything of yours. Revoke any time.",
  fixesH: "Real fixes",
  fixes: [
    { date: "Nov 9", what: "Production deploy failed on Vercel", tag: "", took: "9 min 48 s" },
  ],
  agentLink: "Or give your agent setup.md",
  pricingH: "Pricing",
  price: "Free",
  priceNote: "Requires your own coding agent: Claude Code or Codex. Fixes run on your plan.",
  faqH: "Questions",
  faq: [
    { q: "Which hosts does it work with?", a: "Vercel only, for now." },
    { q: "Which agents does it work with?", a: "Claude Code and Codex hear about a break when a session starts. Fixes while nobody is at the keyboard run in a GitHub job on your Claude Code plan." },
    { q: "Does my laptop need to be on?", a: "No. A GitHub job can start the fix on your own Claude plan at any hour. Or the fixer runs on your computer while it’s on." },
    { q: "Why did some fixes take hours?", a: "Most breaks so far were on apps without the fix job on, so they waited until someone opened their agent. With it on, a scheduled job that goes quiet gets its fix started the moment Spooky alerts." },
    { q: "Can it break or delete anything?", a: "No. Spooky reads Vercel and GitHub and never deletes anything of yours. Its one write is starting the fix workflow in repos where you added it. Your agent ships a fix only the way your repo’s own rules allow, or opens a pull request." },
    { q: "How do I hear about it?", a: "Your account email by default. Add ntfy on your phone in a minute." },
    { q: "Why is it free?", a: "Your agent does the fixing, on your plan. Spooky watches and connects the two." },
  ],
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

/** FAQPage JSON-LD, built from the same answers the page shows. */
const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: COPY.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
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
    <div className="flex w-full flex-col items-stretch gap-3 min-[821px]:w-auto min-[821px]:gap-2.5 min-[821px]:flex-row min-[821px]:flex-wrap min-[821px]:items-center">
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(FAQ_LD).replace(/</g, "\\u003c"),
        }}
      />
      <header className="relative z-[1] mx-auto flex w-full max-w-[760px] items-center px-4 py-4 sm:py-6">
        <Wordmark />
        <LiveCount />
      </header>

      <main className="relative z-[1] flex flex-1 flex-col">
        {/* First screen: Einstein, the line, two ways in. Nothing else. */}
        <section className="hero relative mx-auto flex min-h-[calc(80svh-56px)] w-full max-w-[760px] flex-col items-start justify-center px-4 pb-10 text-left min-[821px]:min-h-[72dvh]">
          <div className="hero-portrait" aria-hidden />
          <div className="hero-scrim" aria-hidden />
          <p className="relative font-mono text-[12.5px] leading-[1.5] text-fg-2">
            {COPY.quote}
            <span className="ml-2.5 text-fg-3">{COPY.quoteSource}</span>
          </p>
          <h1 className="relative mt-10 text-[38px] leading-[1.04] font-medium tracking-[-0.025em] text-fg min-[821px]:mt-9 min-[821px]:text-[64px] min-[821px]:leading-[1.02]">
            {COPY.h1[0]} <span className="block text-fg-2">{COPY.h1[1]}</span>
          </h1>
          <p className="relative mt-6 max-w-[34ch] text-[16px] leading-[1.55] text-pretty text-fg-2 min-[821px]:mt-5 min-[821px]:max-w-[44ch] min-[821px]:text-[17px]">
            {COPY.sub}
          </p>
          <div className="relative mt-10 w-full min-[821px]:mt-9 min-[821px]:w-auto">
            <Suspense fallback={null}>
              <SignInNotice />
            </Suspense>
            <WaysIn vercelEnabled={vercelEnabled} />
            <p className="mt-4 font-mono text-[12.5px] leading-[1.5] text-fg-3">{COPY.free}</p>
          </div>
        </section>

        {/* What changes for you, then the pair playing a real fix. */}
        <div className="relative z-[1] mx-auto w-full max-w-[760px] px-4 pb-16">
          <section aria-labelledby="change-h">
            <h2 id="change-h" className="text-[20px] leading-[1.3] font-medium tracking-[-0.01em] text-fg">{COPY.changeH}</h2>
            <div className="mt-5 grid gap-3 min-[821px]:grid-cols-2">
              {[COPY.before, COPY.after].map((c, i) => (
                <div key={c.k} className={`rounded-xl border px-5 py-5 ${i ? "border-line-3" : "border-line-1"}`}>
                  <p className={`font-mono text-[12px] ${i ? "text-accent" : "text-fg-3"}`}>{c.k}</p>
                  <p className={`mt-2 text-[16px] leading-[1.6] text-pretty ${i ? "text-fg" : "text-fg-2"}`}>{c.p}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[16px] leading-[1.6] text-pretty text-fg-2">{COPY.setupCost}</p>
          </section>
        </div>

        {/* Just below: the pair, playing a real fix. */}
        <section aria-label="A fix, played back" className="fix-stage">
          <Particles />
        </section>

        <div className="mx-auto w-full max-w-[760px] px-4 pb-28 sm:px-4">
          <section aria-labelledby="watch-h" className="mt-8">
            <h2 id="watch-h" className="text-[20px] leading-[1.3] font-medium tracking-[-0.01em] text-fg">{COPY.watchH}</h2>
            <dl className="mt-5 border-t border-line-1">
              {COPY.watch.map((w) => (
                <div key={w.k} className="grid gap-1 border-b border-line-1 py-4 min-[821px]:grid-cols-[160px_1fr] min-[821px]:gap-4">
                  <dt className="font-mono text-[13px] leading-[1.7] text-fg-2">{w.k}</dt>
                  <dd className="text-[16px] leading-[1.6] text-pretty text-fg">{w.v}</dd>
                </div>
              ))}
            </dl>
          </section>


          <div className="mt-24">
            <LiveFixes fallback={COPY.fixes} fallbackTitle={COPY.fixesH} />
          </div>

          <section aria-labelledby="pricing-h" className="mt-24">
            <h2 id="pricing-h" className="text-[20px] font-medium tracking-[-0.01em] text-fg">
              {COPY.pricingH}
            </h2>
            <p className="mt-4 text-[16px] leading-[1.6] text-pretty text-fg-2">
              <span className="font-medium text-fg">{COPY.price}.</span> {COPY.priceNote}
            </p>
          </section>

          <section aria-labelledby="faq-h" className="mt-24">
            <h2 id="faq-h" className="text-[20px] font-medium tracking-[-0.01em] text-fg">
              {COPY.faqH}
            </h2>
            <div className="mt-5 border-t border-line-1">
              {COPY.faq.map((f) => (
                <details key={f.q} className="faq group border-b border-line-1">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16px] text-fg">
                    {f.q}
                    <span aria-hidden className="font-mono text-[15px] text-fg-3 transition-transform duration-200 group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-5 text-[15px] leading-[1.65] text-pretty text-fg-2">{f.a}</p>
                </details>
              ))}
            </div>
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
            <p className="mt-5 font-mono text-[12px] text-fg-2">{COPY.reassure}</p>
          </section>
        </div>
      </main>

      <footer className="relative z-[1] mx-auto flex w-full max-w-[760px] flex-col gap-1 px-4 pb-6 font-mono text-[12px] text-fg-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
        <Footer className="text-[12px]" />
        <nav aria-label="Site" className="flex gap-4 sm:ml-auto">
          <a href="/setup.md" className="hover:text-fg">For agents</a>
          <a href="/automate-fixes" className="hover:text-fg">Automate fixes</a>
          <a href="/releases" className="hover:text-fg">Releases</a>
          <a href="/vibeops" className="hover:text-fg">VibeOps</a>
        </nav>
        <nav aria-label="Vercel errors" className="flex flex-wrap gap-x-4 gap-y-1 sm:basis-full">
          <span className="text-fg-3">Vercel errors</span>
          {VERCEL_ERROR_PAGES.map((p) => (
            <a key={p.slug} href={`/${p.slug}`} className="hover:text-fg">{p.label}</a>
          ))}
        </nav>
        <p>Not affiliated with Vercel.</p>
      </footer>
    </div>
  );
}
