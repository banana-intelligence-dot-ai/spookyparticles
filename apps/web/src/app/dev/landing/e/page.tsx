import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { SignIn } from "../../../sign-in";
import { AGENT_PROMPT, DirectionTag, Header, SiteFooter } from "../parts";

/**
 * Direction E, "Agent-first". The page is the setup conversation: the one line you paste and
 * what your agent does with it, following the real setup.md (links you click, a key that reads by default,
 * a verify call, then the first numbers). People who'd rather click sign in from a quieter row.
 * Tool calls in mono, the agent's sentences in sans, like the product's own session view.
 */
export default function AgentLanding() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-8">
      <Header motto="DevOps for vibe coders."
        right={
          <a href="#sign-in" className="hidden text-[14px] text-fg-2 hover:text-fg sm:inline">
            Sign in
          </a>
        }
      />

      <main className="flex flex-1 flex-col pt-10 pb-24 sm:pt-16">
        <h1 className="max-w-[20ch] text-[32px] leading-[1.1] font-medium tracking-[-0.025em] text-balance text-fg sm:text-[48px] sm:leading-[1.05]">
          Paste one line. Your agent finds every app you’ve shipped.
        </h1>
        <p className="mt-4 max-w-[56ch] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:text-[20px] sm:leading-[1.5]">
          Where each one runs, what it costs and what you forgot, across every login. Works in Claude Code, Cursor, Codex or any
          coding agent.
        </p>

        <h2 className="mt-10 text-[14px] font-medium text-fg">Set up with your agent</h2>
        <Session />

        <div id="sign-in" className="mt-10 flex flex-col gap-4 border-t border-line-1 pt-8 lg:flex-row lg:items-start lg:justify-between">
          <p className="text-[16px] text-fg-2">Rather click through it yourself?</p>
          <SignIn />
        </div>

        <section aria-labelledby="rules" className="mt-24 sm:mt-32">
          <h2 id="rules" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
            What your agent can and can’t do
          </h2>
          <div className="mt-6 grid gap-x-16 gap-y-8 sm:grid-cols-2">
            <Rules
              title="Can"
              items={["Read your repos and deploys", "Read the bills in your inbox", "Show you every number with its source", "Draft a plan for you to approve"]}
            />
            <Rules
              title="Can’t"
              items={["See a password or sign-in token", "Click a consent screen for you", "Change DNS, billing or a repo", "Delete anything, ever"]}
            />
          </div>
          <p className="mt-8 text-[14px] text-fg-3">
            The name comes from Einstein: “spooky action at a distance,” in a letter to Max Born, 1947.
          </p>
        </section>
      </main>

      <SiteFooter />
      <DirectionTag letter="E" name="Agent-first" />
    </div>
  );
}

function Session() {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-line-2 bg-bg-deep shadow-[inset_0_1px_0_var(--highlight)]">
      {/* The real, copyable paste line */}
      <div className="flex items-start gap-3 border-b border-line-1 bg-raised py-3 pr-2 pl-4 sm:pl-5">
        <span aria-hidden className="pt-px font-mono text-[14px] text-accent">›</span>
        <code className="min-w-0 flex-1 font-mono text-[14px] leading-[1.5] break-words text-fg">{AGENT_PROMPT}</code>
        <CopyButton value={AGENT_PROMPT} label="Copy the setup prompt" />
      </div>

      <ol className="space-y-4 px-4 py-5 sm:px-5" aria-label="A sample setup session">
        <Say>Read setup.md. Three things need you: one sign-in, your inboxes, and a key that reads by default. I never see a password.</Say>
        <Tool cmd="open spookyparticles.com" result="you signed in with GitHub, installed on 3 accounts" />
        <Tool cmd="open spookyparticles.com/app · Connect Gmail" result="you connected 2 inboxes" />
        <Tool cmd='curl -s -H "Authorization: Bearer $SPOOKY_API_KEY" …/api/v1/me' result="PASS · auth.via: api_key" />
        <Tool cmd="curl … /api/v1/findings" result="3 findings" />
        <li className="pl-5">
          <div className="overflow-hidden rounded-lg border border-line-1">
            {[
              ["invoice-bot", "Railway", "$38.40/mo", "no push in 112 days"],
              ["pdf-to-podcast", "Render", "$25.00/mo", "no deploy in 140 days"],
              ["waitlist-v2", "Supabase", "$25.00/mo", "Pro plan, 10 rows"],
            ].map(([p, h, c, n]) => (
              <div key={p} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-line-1 px-3 py-2 font-mono text-[12px] last:border-b-0 sm:grid-cols-[160px_96px_96px_minmax(0,1fr)] sm:text-[14px]">
                <span className="truncate text-fg">{p}</span>
                <span className="text-right text-fg sm:order-2 sm:text-left">{c}</span>
                <span className="text-fg-3 sm:order-1">{h}</span>
                <span className="truncate text-right text-amber sm:order-3 sm:text-left">{n}</span>
              </div>
            ))}
          </div>
        </li>
        <Say>
          You pay <Num>$412.00/mo</Num> across 9 projects. These 3 look forgotten, <Num>$88.40/mo</Num> together. Want the cancel steps for
          each?
        </Say>
      </ol>
      <p className="border-t border-line-1 px-4 py-2.5 text-[12px] text-fg-3 sm:px-5">A sample session. Your agent follows the same steps with your accounts.</p>
    </div>
  );
}

function Say({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-fg" />
      <p className="max-w-[64ch] text-[16px] leading-[1.6] text-pretty text-fg">{children}</p>
    </li>
  );
}

function Tool({ cmd, result }: { cmd: string; result: string }) {
  return (
    <li className="pl-5 font-mono text-[12px] leading-[1.5] sm:text-[14px]">
      <span className="block truncate text-fg-2">{cmd}</span>
      <span className="block text-fg-3">
        <span aria-hidden>└ </span>
        {result}
      </span>
    </li>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <span className="font-mono text-fg">{children}</span>;
}

function Rules({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="border-b border-line-2 pb-2 text-[14px] font-medium text-fg">{title}</p>
      <ul className="mt-1">
        {items.map((i) => (
          <li key={i} className="border-b border-line-1 py-2.5 text-[16px] text-fg-2">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
