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
  title: "Spooky Particles: entangle your coding agent with your app",
  description:
    "Entangle your coding agent with your app. If something breaks, your agent gets pinged and ships the fix. Spooky checks every 5 minutes. Read-only.",
  quote: "“spooky action at a distance”",
  quoteSource: "Einstein, 1947",
  h1: ["Fixed by the time", "you realize it’s broken."],
  sub: ["Entangle your coding agent with your app.", "If something breaks, your agent gets pinged and ships the fix."],
  reassure: "Read-only. Never deletes anything. Revoke any time.",
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
      <Particles />
      <header className="relative z-[1] mx-auto flex w-full max-w-[1216px] items-center px-4 py-4 sm:px-12 sm:py-6">
        <Wordmark />
      </header>

      <main className="relative z-[1] mx-auto flex w-full max-w-[1216px] flex-1 flex-col px-4 pt-[56px] pb-[84px] text-left min-[821px]:items-center min-[821px]:justify-center min-[821px]:px-12 min-[821px]:py-8 min-[821px]:text-center">
        <p className="font-mono text-[12.5px] leading-[1.5] text-fg-2">
          {COPY.quote}
          <span className="block text-fg-3 min-[821px]:ml-2.5 min-[821px]:inline">{COPY.quoteSource}</span>
        </p>
        <h1 className="mt-6 text-[34px] leading-[1.06] font-medium tracking-[-0.025em] text-fg min-[821px]:mt-9 min-[821px]:text-[60px] min-[821px]:leading-[1.03]">
          {COPY.h1[0]} <span className="block text-fg-2">{COPY.h1[1]}</span>
        </h1>
        <p className="mt-3 max-w-[500px] text-[16px] leading-[1.6] text-pretty text-fg-2 min-[821px]:mt-[18px] min-[821px]:text-[17px]">
          {COPY.sub[0]} <span className="min-[821px]:block">{COPY.sub[1]}</span>
        </p>
        <div className="mt-[22px] w-full min-[821px]:mt-[30px] min-[821px]:w-auto">
          <Suspense fallback={null}>
            <SignInNotice />
          </Suspense>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2.5 min-[821px]:w-auto min-[821px]:flex-row min-[821px]:flex-wrap min-[821px]:items-center min-[821px]:justify-center">
          <SignIn large ink inline vercelEnabled={vercelEnabled} />
          <PastePrompt prompt={AGENT_PROMPT} />
        </div>
        <p className="mt-4 font-mono text-[12px] text-balance text-fg-3">{COPY.reassure}</p>
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
