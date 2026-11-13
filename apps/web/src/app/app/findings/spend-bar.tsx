"use client";
/**
 * The month as one bar: every work vendor as a segment, sized by what it costs a month. The
 * parts Spooky found can go are striped amber. Tap a segment for the vendor in one line.
 * Real bills only; personal and unverified lines are never in it.
 */
import { useMemo, useState } from "react";
import type { Finding, Subscription } from "../data-model";
import { money } from "../spend-model";

/** goCents is the part of this vendor the finding says can go, never more than the vendor costs. */
type Part = { s: Subscription; cents: number; going: Finding | null; goCents: number };

/** Pure: work vendors largest first, each matched to the can-go finding that rests on its receipts. */
export function spendParts(work: Subscription[], going: Finding[]): Part[] {
  return work
    .filter((s) => (s.monthlyCents ?? 0) > 0)
    .map((s) => {
      const cents = s.monthlyCents ?? 0;
      const f = going.find((x) => x.evidence.receiptIds.some((id) => s.receiptIds.includes(id))) ?? null;
      return { s, cents, going: f, goCents: f ? Math.min(cents, f.amountCents ?? 0) : 0 };
    })
    .sort((a, b) => b.cents - a.cents);
}

const STRIPE = "bg-amber/25 bg-[repeating-linear-gradient(135deg,var(--color-amber)_0_2px,transparent_2px_6px)]";

export function SpendBar({ work, going, currency }: { work: Subscription[]; going: Finding[]; currency: string }) {
  const parts = useMemo(() => spendParts(work, going), [work, going]);
  const total = parts.reduce((n, p) => n + p.cents, 0);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  if (!total) return null;
  const shown = parts.find((p) => p.s.id === (hover ?? picked)) ?? null;
  const anyGoing = parts.some((p) => p.goCents > 0);
  const pct = (c: number) => (c / total) * 100;

  return (
    <div className="mt-6">
      <div className="flex h-11 w-full gap-[2px] overflow-hidden rounded-xl" role="group" aria-label="Work spend by vendor">
        {parts.map((p, i) => {
          const active = shown?.s.id === p.s.id;
          return (
            <button
              key={p.s.id}
              type="button"
              aria-pressed={picked === p.s.id}
              aria-label={`${p.s.vendor}: ${money(p.cents, currency)} a month, ${Math.round(pct(p.cents))}%${p.goCents ? `, ${money(p.goCents, currency)} can go` : ""}`}
              onMouseEnter={() => setHover(p.s.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.s.id)}
              onBlur={() => setHover(null)}
              onClick={() => setPicked(picked === p.s.id ? null : p.s.id)}
              style={{ flexGrow: p.cents, flexBasis: 0, minWidth: 6 }}
              className={`relative flex h-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-fg/40 focus-visible:ring-inset ${i % 2 ? "bg-fg-3/45" : "bg-fg-3/30"} ${shown && !active ? "opacity-45" : ""}`}
            >
              {p.goCents ? <span aria-hidden className={`ml-auto h-full ${STRIPE}`} style={{ width: `${(p.goCents / p.cents) * 100}%` }} /> : null}
              {pct(p.cents) > 12 ? <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 truncate text-left text-[12px] text-fg">{p.s.vendor}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex min-h-11 flex-wrap items-baseline gap-x-2 text-[14px] text-fg-2" aria-live="polite">
        {shown ? (
          <>
            <span className="text-fg">{shown.s.vendor}</span>
            <span className="num font-mono text-fg">{money(shown.cents, currency)}</span>/mo, {Math.round(pct(shown.cents))}% of work spend.
            {shown.going ? (
              <a href="#go-title" className="text-amber underline decoration-amber/40 underline-offset-4 hover:decoration-amber">
                <span className="num font-mono">{money(shown.goCents, currency)}</span>/mo can go: {shown.going.title}
              </a>
            ) : (
              <a href="#bars-title" className="underline decoration-line-3 underline-offset-4 hover:text-fg">
                See its receipts
              </a>
            )}
          </>
        ) : anyGoing ? (
          <>
            <span aria-hidden className={`inline-block h-2.5 w-4 self-center rounded-[3px] ${STRIPE}`} />
            Striped is what Spooky found can go. Tap a part for the vendor.
          </>
        ) : (
          "Each part is a vendor, sized by what it costs a month. Tap one for the vendor."
        )}
      </p>
    </div>
  );
}
