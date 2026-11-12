import { buttonStyles } from "@/components/ui";
import { SignIn } from "../../../sign-in";
import { AgentSetup, DirectionTag, Header, Promises, SAMPLE, SAMPLE_CAN_GO, SAMPLE_TOTAL, SiteFooter, money } from "../parts";

/**
 * Direction D, "The receipt". The number first: a true,
 * surprising figure from email alone, with every line traced to the email it came from and one
 * action on the lines that can go. Money is plain ink; amber marks what needs you.
 */

type Line = { vendor: string; count: number; cents: number; note?: string; canGoCents: number; source: string };

function receipt(): Line[] {
  const by = new Map<string, Line>();
  for (const l of SAMPLE) {
    const k = l.vendor;
    const cur = by.get(k) ?? { vendor: k, count: 0, cents: 0, canGoCents: 0, source: l.source };
    cur.count += 1;
    cur.cents += l.cents;
    if (l.canGo) {
      cur.canGoCents += l.cents;
      cur.note = l.note;
    } else if (!cur.note && l.note?.startsWith("usage")) cur.note = "usage, about";
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.cents - a.cents);
}

export default function ReceiptLanding() {
  const lines = receipt();
  const [dollars, cents] = money(SAMPLE_TOTAL).split(".");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-8">
      <Header motto="DevOps for vibe coders." />

      <main className="flex flex-1 flex-col pt-10 pb-24 sm:pt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
          <div>
            <p className="text-[14px] text-fg-3">A sample result, read from 2 inboxes</p>
            <p className="mt-2 font-mono leading-none font-medium tracking-[-0.04em] text-fg" aria-label={`${money(SAMPLE_TOTAL)} a month`}>
              <span className="text-[64px] sm:text-[96px]">{dollars}</span>
              <span className="text-[32px] text-fg-2 sm:text-[48px]">.{cents}/mo</span>
            </p>
            <p className="mt-4 max-w-[36ch] text-[20px] leading-[1.35] text-balance text-fg sm:text-[24px]">
              across 9 projects. <span className="text-amber">3 you forgot</span>, {money(SAMPLE_CAN_GO)} a month.
            </p>

            <h1 className="mt-12 max-w-[24ch] border-t border-line-1 pt-8 text-[24px] leading-[1.2] font-medium tracking-[-0.015em] text-balance text-fg sm:text-[32px] sm:leading-[1.15]">
              VibeOps for everything you’ve shipped.
            </h1>
            <p className="mt-3 max-w-[48ch] text-[16px] leading-[1.6] text-pretty text-fg-2">
              Start with what it really costs. Then what’s live, what broke and what to cancel, with a source for every number.
            </p>
            <div className="mt-8">
              <SignIn large />
            </div>
            <Promises className="mt-6" />
          </div>

          <Receipt lines={lines} />
        </div>

        <section aria-labelledby="source" className="mt-24 grid gap-12 border-t border-line-1 pt-10 lg:grid-cols-2 lg:gap-16 sm:mt-32">
          <div>
            <h2 id="source" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
              Every line traces to an email.
            </h2>
            <p className="mt-2 max-w-[48ch] text-[16px] text-pretty text-fg-2">
              Open any line and see the receipt it came from, the project it pays for and the last time you touched it.
            </p>
            <SourceCard />
          </div>
          <AgentSetup />
        </section>
      </main>

      <SiteFooter />
      <DirectionTag letter="D" name="The receipt" />
    </div>
  );
}

function Receipt({ lines }: { lines: Line[] }) {
  return (
    <div className="self-start rounded-2xl border border-line-2 bg-raised font-mono shadow-[inset_0_1px_0_var(--highlight)]">
      <div className="flex items-baseline justify-between border-b border-dashed border-line-2 px-5 py-4 text-[12px] text-fg-3">
        <span>spooky particles · monthly</span>
        <span>Oct 2026</span>
      </div>
      <ul className="px-5 py-3">
        {lines.map((l) => (
          <li key={l.vendor} className="py-1.5">
            <div className="flex items-baseline gap-2 text-[14px]">
              <span className={`flex items-center gap-2 ${l.canGoCents ? "text-fg" : "text-fg"}`}>
                {l.canGoCents ? <span aria-hidden className="size-1.5 rounded-full bg-amber" /> : null}
                {l.vendor}
                {l.count > 1 ? <span className="text-fg-3">×{l.count}</span> : null}
              </span>
              <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-line-3" />
              <span className="text-fg">{money(l.cents)}</span>
            </div>
            {l.note ? (
              <p className={`text-[12px] ${l.canGoCents ? "pl-3.5 text-amber" : "text-fg-3"}`}>{l.note}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="border-t border-dashed border-line-2 px-5 py-4">
        <div className="flex items-baseline justify-between text-[14px] text-fg-2">
          <span>Can go</span>
          <span className="text-fg">{money(SAMPLE_CAN_GO)}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between text-[20px] font-medium text-fg">
          <span>Total</span>
          <span>{money(SAMPLE_TOTAL)}</span>
        </div>
      </div>
    </div>
  );
}

function SourceCard() {
  return (
    <div className="mt-6 rounded-2xl border border-line-2 bg-raised shadow-[inset_0_1px_0_var(--highlight)]">
      <div className="flex items-start justify-between gap-4 border-b border-line-1 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[14px] text-fg">
            <span aria-hidden className="size-1.5 rounded-full bg-amber" />
            pdf-to-podcast
          </p>
          <p className="mt-0.5 text-[14px] text-amber">No deploy in 140 days</p>
        </div>
        <p className="font-mono text-[20px] text-fg">$25.00</p>
      </div>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-4 text-[14px]">
        <dt className="text-fg-3">From</dt>
        <dd className="truncate font-mono text-fg-2">billing@render.com</dd>
        <dt className="text-fg-3">Subject</dt>
        <dd className="truncate text-fg-2">Your Render invoice for October</dd>
        <dt className="text-fg-3">Dated</dt>
        <dd className="font-mono text-fg-2">Oct 3, 2026</dd>
        <dt className="text-fg-3">Account</dt>
        <dd className="truncate font-mono text-fg-2">an older Render login</dd>
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-line-1 px-5 py-4">
        <span className={buttonStyles.secondary}>How to cancel</span>
        <span className={buttonStyles.ghost}>Open the email</span>
      </div>
    </div>
  );
}
