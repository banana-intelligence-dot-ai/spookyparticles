import Link from "next/link";
import type { ReactNode } from "react";
import { Footer, Wordmark } from "@/components/brand";
import { CopyButton } from "@/components/copy-button";

/**
 * Shared pieces for the five landing directions (dev only). Each direction keeps the same
 * wordmark, sign-in, agent block and footer so the comparison is about the idea, not the parts.
 */

export const AGENT_PROMPT =
  "Fetch and follow the instructions at https://spookyparticles.com/setup.md to set up Spooky Particles for me.";

export const PROMISES = ["Read-only", "Revoke any time", "Never deletes anything"];

/** Wordmark with the motto beside it (a hairline between) from sm up, under it on a phone. */
export function Header({ motto, right }: { motto: string; right?: ReactNode }) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <Wordmark />
        <span aria-hidden className="hidden h-4 w-px bg-line-2 sm:block" />
        <p className="text-[14px] leading-[1.3] text-fg-2">{motto}</p>
      </div>
      {right}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="flex h-16 items-center border-t border-line-1">
      <Footer />
    </footer>
  );
}

export function Promises({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-fg-2 ${className}`}>
      {PROMISES.map((p) => (
        <li key={p} className="inline-flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="size-3.5 text-fg" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M3 8.5 6.5 12 13 4.5" />
          </svg>
          {p}
        </li>
      ))}
    </ul>
  );
}

/** The paste line, as one copyable row. */
export function PasteRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-start gap-1 rounded-lg border border-line-2 bg-raised py-2.5 pr-1.5 pl-3 ${className}`}>
      <code className="min-w-0 flex-1 font-mono text-[14px] leading-[1.5] break-words text-code">{AGENT_PROMPT}</code>
      <CopyButton value={AGENT_PROMPT} label="Copy the setup prompt" />
    </div>
  );
}

export function AgentSetup({ className = "" }: { className?: string }) {
  return (
    <section aria-labelledby="agent-setup" className={className}>
      <h2 id="agent-setup" className="text-[14px] font-medium text-fg">
        Set up with your agent
      </h2>
      <p className="mt-1 text-[14px] text-fg-2">Paste this into Claude Code, Cursor or any coding agent.</p>
      <PasteRow className="mt-3" />
      <p className="mt-2 text-[14px] text-pretty text-fg-3">
        You click every sign-in yourself. Your agent never sees a password. It uses a key you make, read-only by default.
      </p>
    </section>
  );
}

/** Dev-only marker under the footer so the directions can be told the directions apart in a screenshot. Never ships. */
export function DirectionTag({ letter, name, note }: { letter: string; name: string; note?: string }) {
  return (
    <div className="mx-auto mb-6 flex w-fit max-w-[calc(100%-32px)] flex-wrap items-center gap-x-2 rounded-full border border-dashed border-line-2 px-3 py-1.5 font-mono text-[12px] text-fg-3">
      <span className="text-fg">{letter}</span>
      <span>{name}</span>
      {note ? <span className="text-amber">{note}</span> : null}
    </div>
  );
}

export function DirectionIndex() {
  const items: [string, string, string][] = [
    ["a", "The letter", "Typographic. The 1947 quote as the hero, a ledger as the proof."],
    ["b", "Entangled", "Touch a project, everything tied to it lights up."],
    ["c", "Observatory", "Night sky, restrained. Bends the no-starfield rule."],
    ["d", "The receipt", "The number first. What you pay, and what you forgot."],
    ["e", "Agent-first", "The page is the setup conversation."],
    ["f", "The bill per app", "Spend-led value prop. Rejected: the product leads with ops, not spend."],
    ["g", "The ops team", "Value-prop pick, revised: the ops team for every app you’ve shipped."],
  ];
  return (
    <ul className="divide-y divide-line-1 border-y border-line-1">
      {items.map(([k, name, line]) => (
        <li key={k}>
          <Link href={`/dev/landing/${k}`} className="flex items-baseline gap-4 py-4 hover:bg-raised">
            <span className="w-6 font-mono text-[14px] text-fg-3 uppercase">{k}</span>
            <span className="w-40 text-[16px] text-fg">{name}</span>
            <span className="text-[14px] text-fg-2">{line}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * A sample inventory with the shape of a real one: nine projects across five hosts, bills read
 * from two inboxes. Names are generic project names, not anyone's data, and every view labels it a sample.
 * Monthly totals add up to $412.00, and the three "can go" lines to $88.40.
 */
export type SampleLine = {
  project: string;
  host: string;
  vendor: string;
  source: string;
  date: string;
  cents: number;
  lastPush: string;
  note?: string;
  canGo?: boolean;
};

export const SAMPLE: SampleLine[] = [
  { project: "habit-tracker", host: "vercel", vendor: "Vercel Pro", source: "billing@vercel.com", date: "Oct 14", cents: 2000, lastPush: "4d" },
  { project: "recipe-box", host: "vercel", vendor: "Vercel Pro", source: "billing@vercel.com", date: "Oct 21", cents: 2000, lastPush: "12d", note: "2nd Vercel Pro account" },
  { project: "lease-reader", host: "vercel", vendor: "Vercel Pro", source: "billing@vercel.com", date: "Oct 9", cents: 2000, lastPush: "2d", note: "3rd Vercel Pro account" },
  { project: "invoice-bot", host: "railway", vendor: "Railway", source: "receipts@railway.app", date: "Oct 1", cents: 3840, lastPush: "112d", note: "No push in 112 days", canGo: true },
  { project: "pdf-to-podcast", host: "render", vendor: "Render", source: "billing@render.com", date: "Oct 3", cents: 2500, lastPush: "140d", note: "No deploy in 140 days", canGo: true },
  { project: "waitlist-v2", host: "supabase", vendor: "Supabase Pro", source: "billing@supabase.io", date: "Oct 18", cents: 2500, lastPush: "201d", note: "Pro plan, 10 rows", canGo: true },
  { project: "trip-planner", host: "supabase", vendor: "Supabase Pro", source: "billing@supabase.io", date: "Oct 18", cents: 2500, lastPush: "2d" },
  { project: "shared", host: "openai", vendor: "OpenAI API", source: "noreply@openai.com", date: "Oct 31", cents: 11410, lastPush: "", note: "usage, about" },
  { project: "shared", host: "anthropic", vendor: "Anthropic API", source: "invoices@anthropic.com", date: "Oct 31", cents: 9000, lastPush: "", note: "usage, about" },
  { project: "email-relay", host: "resend", vendor: "Resend Pro", source: "billing@resend.com", date: "Oct 12", cents: 2000, lastPush: "33d" },
  { project: "edge-cache", host: "cloudflare", vendor: "Workers Paid", source: "billing@cloudflare.com", date: "Oct 5", cents: 500, lastPush: "61d" },
  { project: "6 domains", host: "porkbun", vendor: "Domains", source: "support@porkbun.com", date: "Mar 2", cents: 950, lastPush: "", note: "yearly, spread" },
];

export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SAMPLE_TOTAL = SAMPLE.reduce((s, l) => s + l.cents, 0);
export const SAMPLE_CAN_GO = SAMPLE.filter((l) => l.canGo).reduce((s, l) => s + l.cents, 0);
