"use client";
/**
 * The two pictures on Spend: one bar per work vendor, and the next 60 days as a dated strip.
 * Plain ink for money (no green), amber only for what needs a decision.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Chevron } from "@/components/ui";
import type { Subscription } from "../data-model";
import { cadenceNote, dueDate, money, type Due } from "../spend-model";

const DAY = 86_400_000;

/** One bar per vendor, scaled to the largest. A row opens to its receipts and the work or personal call. */
export function VendorBars({
  list,
  currency,
  limit = 8,
  detail,
  trailer,
  max: scaleMax,
}: {
  list: Subscription[];
  currency: string;
  limit?: number;
  detail: (s: Subscription) => ReactNode;
  /** Repos and addresses for the row's tertiary line, minus what a filter already says. */
  trailer?: (s: Subscription) => string[];
  /** The amount a full bar stands for. Defaults to the largest in the list. */
  max?: number;
}) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const max = scaleMax ?? Math.max(1, ...list.map((s) => s.monthlyCents ?? 0));
  const shown = all ? list : list.slice(0, limit);
  const rest = list.length - shown.length;
  return (
    <div>
      <ul className="flex flex-col">
        {shown.map((s) => {
          const pct = Math.max(0.6, ((s.monthlyCents ?? 0) / max) * 100);
          const tail = trailer?.(s) ?? [];
          const note = cadenceNote(s) ?? (s.inboxes.length > 1 ? `billed in ${s.inboxes.length} inboxes` : null);
          const isOpen = open === s.id;
          const panel = `bar-${s.id}`;
          return (
            <li key={s.id} className="border-b border-line-1 last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : s.id)}
                className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 text-left sm:grid-cols-[168px_minmax(0,1fr)_96px_176px] sm:py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-[14px] text-fg">
                  <span className="text-fg-3 transition-colors group-hover:text-fg-2">
                    <Chevron open={isOpen} className="size-3" />
                  </span>
                  <span className="truncate">{s.vendor}</span>
                </span>
                <span className="num text-right font-mono text-[14px] text-fg sm:order-3">{money(s.monthlyCents ?? 0, currency)}</span>
                <span aria-hidden className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-line-1 sm:order-2 sm:col-span-1">
                  <span
                    className={`block h-full rounded-full transition-[opacity,background-color] duration-150 group-hover:opacity-100 ${
                      s.cadence === "usage" ? `${STRIPE} opacity-80` : s.cadence === "annual" ? `${HOLLOW} opacity-80` : "bg-fg-2 group-hover:bg-fg"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span
                  className={`col-span-2 -mt-1 truncate pl-5 text-[12px] text-fg-3 empty:hidden sm:order-4 sm:col-span-1 sm:mt-0 sm:block sm:pl-0 ${tail.length ? "hidden" : ""}`}
                >
                  {note}
                </span>
                {tail.length ? (
                  <span
                    title={tail.join(", ")}
                    className="col-span-2 -mt-1 truncate pl-5 text-[12px] leading-[1.5] text-fg-3 sm:order-5 sm:col-span-2 sm:-mt-1"
                  >
                    {note ? <span className="sm:hidden">{note} · </span> : null}
                    <span className="font-mono">{tail.join(" · ")}</span>
                  </span>
                ) : null}
              </button>
              {isOpen ? (
                <div id={panel} className="pb-4 pl-5 sm:pl-[184px]">
                  {detail(s)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {shown.some(estimated) ? (
        <div className="mt-3">
          <EstimateKey usage={shown.some((s) => s.cadence === "usage")} annual={shown.some((s) => s.cadence === "annual")} />
        </div>
      ) : null}
      {rest > 0 || all ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-1 inline-flex h-11 items-center gap-2 text-[14px] text-fg-2 hover:text-fg sm:h-9"
        >
          <Chevron open={all} className="size-3" />
          {all ? "Show the top " + limit : `${rest} more`}
        </button>
      ) : null}
    </div>
  );
}

/** Per-month figures that are worked out, not billed as such: annual spread, usage averaged. */
export const estimated = (s: Pick<Subscription, "cadence">) => s.cadence === "annual" || s.cadence === "usage";

const STRIPE = "bg-[repeating-linear-gradient(-45deg,var(--fg-2)_0_2px,transparent_2px_4px)]";
const HOLLOW = "shadow-[inset_0_0_0_1px_var(--fg-2)]";

/** The key for worked-out bars, drawn the same way as the bars. */
export function EstimateKey({ usage, annual }: { usage: boolean; annual: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-fg-3">
      {usage ? (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className={`inline-block h-1.5 w-6 rounded-full ${STRIPE}`} />
          Usage, averaged over 3 months
        </span>
      ) : null}
      {annual ? (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className={`inline-block h-1.5 w-6 rounded-full ${HOLLOW}`} />
          Paid yearly, spread by month
        </span>
      ) : null}
    </span>
  );
}

const KIND: Record<Due["kind"], string> = { charge: "", renewal: "renews", trial: "trial ends" };

/**
 * The next `days` as a strip of dated ticks, amber where a call is needed, and the same items
 * as a dated list under it. Pointing at either lights the other.
 */
export function DueStrip({ items, now, days = 60 }: { items: Due[]; now: number; days?: number }) {
  const [lit, setLit] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const split = 30;
  const soon = items.filter((d) => d.at <= now + split * DAY);
  const later = items.filter((d) => d.at > now + split * DAY);
  const ticks = [0, 15, 30, 45, 60].filter((t) => t <= days);
  const x = (d: Due) => (Math.max(0, Math.min(days, (d.at - now) / DAY)) / days) * 100;
  // Same-day items stack upward so every tick stays visible.
  const stack = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map(
      items.map((d) => {
        const k = dueDate(d.at);
        const n = seen.get(k) ?? 0;
        seen.set(k, n + 1);
        return [d.id, n];
      }),
    );
  }, [items]);
  const depth = Math.max(0, ...stack.values());
  const maxCents = Math.max(1, ...items.map((d) => d.cents ?? 0));
  // Dot area follows the amount: 6px for the smallest, 14px for the largest. Unknown amounts stay small.
  const size = (d: Due) => Math.round(6 + 8 * Math.sqrt((d.cents ?? 0) / maxCents));

  return (
    <div onMouseLeave={() => setLit(null)}>
      <div aria-hidden className="relative mb-6" style={{ height: 48 + depth * 12 }}>
        <div className="absolute inset-x-0 h-px bg-line-3" style={{ top: 22 + depth * 12 }} />
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute bottom-0 text-[12px] leading-none whitespace-nowrap text-fg-3"
            style={t === days ? { right: 0 } : { left: `${(t / days) * 100}%`, transform: t ? "translateX(-50%)" : undefined }}
          >
            {t === 0 ? "Today" : dueDate(now + t * DAY)}
          </span>
        ))}
        {ticks.map((t) => (
          <span key={`g${t}`} className="absolute w-px bg-line-3" style={{ left: `${(t / days) * 100}%`, top: 23 + depth * 12, height: 5 }} />
        ))}
        {items.map((d) => {
          const on = lit === d.id;
          const px = size(d);
          return (
            <span
              key={d.id}
              onMouseEnter={() => setLit(d.id)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-[box-shadow,background-color] duration-150 ease-out ${d.tone === "amber" ? "bg-amber" : on ? "bg-fg" : d.repeat ? "bg-fg-3" : "bg-fg-2"} ${
                on ? "shadow-[0_0_0_2px_var(--bg),0_0_0_3px_var(--fg-2)]" : "shadow-[0_0_0_1.5px_var(--bg)]"
              }`}
              style={{ left: `${x(d)}%`, top: 22 + (depth - (stack.get(d.id) ?? 0)) * 12, width: px, height: px }}
            />
          );
        })}
      </div>
      <p className="-mt-3 mb-4 text-[12px] text-fg-3">A bigger dot is a bigger charge. Faded dots are a monthly bill coming round again.</p>
      <DueList items={soon} lit={lit} onLit={setLit} label={`Due in the next ${split} days`} />
      {later.length ? (
        <>
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
            className="mt-2 inline-flex h-11 items-center gap-2 text-[14px] text-fg-2 hover:text-fg sm:h-9"
          >
            <Chevron open={more} className="size-3" />
            {more ? "Hide" : "Show"} {later.length} more through {dueDate(now + days * DAY)}
          </button>
          {more ? <DueList items={later} lit={lit} onLit={setLit} label={`Due from day ${split + 1} to day ${days}`} /> : null}
        </>
      ) : null}
    </div>
  );
}

function DueList({ items, lit, onLit, label }: { items: Due[]; lit: string | null; onLit: (id: string) => void; label: string }) {
  if (!items.length) return null;
  return (
    <ol aria-label={label} className="grid gap-x-10 sm:grid-flow-col sm:grid-cols-2" style={{ gridTemplateRows: `repeat(${Math.ceil(items.length / 2)}, auto)` }}>
      {items.map((d) => (
        <li
          key={d.id}
          title={d.source}
          onMouseEnter={() => onLit(d.id)}
          className={`flex min-h-11 items-center gap-3 border-b border-line-1 py-1.5 text-[14px] transition-colors duration-150 sm:min-h-10 ${lit === d.id ? "bg-raised-2" : ""}`}
        >
          <span className="num w-12 shrink-0 font-mono text-[12px] text-fg-3">{dueDate(d.at)}</span>
          <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${d.tone === "amber" ? "bg-amber" : "bg-fg-3"}`} />
          <span className="min-w-0 flex-1 truncate text-fg">
            {d.label}
            {KIND[d.kind] ? <span className={d.tone === "amber" ? "text-amber" : "text-fg-2"}> {KIND[d.kind]}</span> : null}
            <span className="sr-only">. {d.source}</span>
          </span>
          {d.amount ? <span className="num shrink-0 font-mono text-[14px] text-fg-2">{d.amount}</span> : null}
          {d.tone === "amber" && d.url ? (
            <a
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[14px] text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg"
            >
              Decide<span className="sr-only"> at {d.vendor}</span>
            </a>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
