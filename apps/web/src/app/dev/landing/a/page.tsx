import { surface } from "@/components/ui";
import { SignIn } from "../../../sign-in";
import { AgentSetup, DirectionTag, Header, Promises, SAMPLE, SAMPLE_CAN_GO, SAMPLE_TOTAL, SiteFooter, money } from "../parts";

/**
 * Direction A, "The letter". Typographic and dense, after Hex. The 1947 phrase is the hero,
 * set once in mono with its source; the product line sits under it; the proof is a ledger.
 */
export default function LetterLanding() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-8">
      <Header motto="DevOps for vibe coders." />

      <main className="flex flex-1 flex-col pt-12 pb-24 sm:pt-24">
        <figure>
          <blockquote lang="de" className="font-mono text-[32px] leading-[1.05] font-medium tracking-[-0.025em] text-fg sm:text-[64px] lg:text-[96px]">
            spukhafte Fernwirkung
          </blockquote>
          <figcaption className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-mono text-[16px] text-fg-2 sm:text-[20px]">“spooky action at a distance”</span>
            <span className="text-[14px] text-fg-3">Albert Einstein, in a letter to Max Born, 1947</span>
          </figcaption>
        </figure>

        <div className="mt-12 grid gap-12 border-t border-line-1 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h1 className="max-w-[22ch] text-[32px] leading-[1.2] font-medium tracking-[-0.015em] text-balance text-fg sm:text-[32px] sm:leading-[1.15]">
              VibeOps for every app you’ve shipped.
            </h1>
            <p className="mt-4 max-w-[48ch] text-[16px] leading-[1.6] text-pretty text-fg-2">
              Every repo, deploy, domain and bill, across every login, in one ledger. See what’s live, what broke and what you can cancel. Every number has a source.
            </p>
            <div className="mt-8">
              <SignIn large />
            </div>
            <Promises className="mt-6" />
          </div>
          <AgentSetup className="lg:pt-2" />
        </div>

        <Ledger />
      </main>

      <SiteFooter />
      <DirectionTag letter="A" name="The letter" />
    </div>
  );
}

/** Written out twice so Tailwind sees both literal class names. */
const COLS = "grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.6fr)_minmax(0,1.2fr)_minmax(0,0.7fr)]";
const MD_COLS = "md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.6fr)_minmax(0,1.2fr)_minmax(0,0.7fr)]";

function Ledger() {
  return (
    <section aria-labelledby="ledger" className="mt-24 sm:mt-32">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="ledger" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
          What one ledger looks like
        </h2>
        <p className="text-[14px] text-fg-3">A sample. Yours is built from your own GitHub and inboxes.</p>
      </div>
      <div className={`overflow-hidden ${surface}`}>
        <div className={`hidden ${COLS} gap-4 border-b border-line-1 px-5 py-3 text-[12px] text-fg-3 md:grid`}>
          <span>Project</span>
          <span>Paid to</span>
          <span>Last push</span>
          <span>Observed</span>
          <span className="text-right">Per month</span>
        </div>
        <ul>
          {SAMPLE.map((l, i) => (
            <li key={i} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-line-1 px-4 py-3 ${MD_COLS} md:items-center md:px-5`}>
              <span className="flex min-w-0 items-center gap-2 font-mono text-[14px] text-fg">
                {l.canGo ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber" /> : null}
                <span className="truncate">{l.project}</span>
              </span>
              <span className="text-right font-mono text-[14px] text-fg md:order-last">{money(l.cents)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-fg-2">{l.vendor}</span>
                <span className="hidden truncate font-mono text-[12px] text-fg-3 md:block">
                  {l.source}, {l.date}
                </span>
              </span>
              <span className="hidden font-mono text-[14px] text-fg-2 md:block">{l.lastPush || "·"}</span>
              <span className={`col-span-2 min-w-0 truncate text-[12px] md:col-span-1 md:text-[14px] ${l.canGo ? "text-amber" : "text-fg-3"}`}>
                {l.note ?? ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-4 md:px-5">
          <span className="text-[14px] text-fg-2">
            12 bills, 9 projects, 2 inboxes · <span className="text-amber">3 can go, {money(SAMPLE_CAN_GO)}/mo</span>
          </span>
          <span className="font-mono text-[20px] font-medium text-fg">{money(SAMPLE_TOTAL)}/mo</span>
        </div>
      </div>
    </section>
  );
}
