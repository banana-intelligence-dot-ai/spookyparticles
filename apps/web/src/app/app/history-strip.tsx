"use client";
/**
 * What came in: the top of History. A bar per day for the last 30 days, stacked by what each
 * signal asked of you: red needed you, amber was a heads-up, grey was routine. Tap a day to
 * show only that day in the list below. Built from the rows already loaded, never invented.
 */
import { useMemo, useState } from "react";
import { formatUsd } from "@/components/use-api";
import { dayKey } from "./project-model";

const DAY = 86_400_000;
export const STRIP_DAYS = 30;
const H = 96;

export type Signal = { at: string; tone: "red" | "amber" | null; label: string; cents: number | null };
type Day = { key: string; start: number; red: number; amber: number; quiet: number; labels: Map<string, number> };

/** label is one of a thing ("incident"); the day sentence adds the s. */
/** Pure: 30 local days ending today, oldest first, with each day's signals counted by tone. */
export function stripDays(signals: Signal[], now: number): Day[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days: Day[] = [];
  for (let i = STRIP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ key: dayKey(d.toISOString()), start: d.getTime(), red: 0, amber: 0, quiet: 0, labels: new Map() });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const s of signals) {
    const d = byKey.get(dayKey(s.at));
    if (!d) continue;
    if (s.tone === "red") d.red++;
    else if (s.tone === "amber") d.amber++;
    else d.quiet++;
    d.labels.set(s.label, (d.labels.get(s.label) ?? 0) + 1);
  }
  return days;
}

const sentence = (d: Day) =>
  [...d.labels.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `${n} ${l}${n === 1 ? "" : "s"}`)
    .join(", ");

export function HistoryStrip({ signals, now, partialSince, picked, onPick }: { signals: Signal[]; now: number; partialSince: string | null; picked: string | null; onPick: (key: string | null) => void }) {
  const days = useMemo(() => stripDays(signals, now), [signals, now]);
  const [hover, setHover] = useState<string | null>(null);
  const inWindow = signals.filter((s) => Date.parse(s.at) >= days[0].start);
  const needed = inWindow.filter((s) => s.tone === "red").length;
  const heads = inWindow.filter((s) => s.tone === "amber").length;
  const cents = inWindow.reduce((n, s) => n + (s.cents ?? 0), 0);
  const max = Math.max(4, ...days.map((d) => d.red + d.amber + d.quiet));
  const shown = days.find((d) => d.key === (hover ?? picked)) ?? null;
  const label = (d: Day) => new Date(d.start).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <section aria-labelledby="came-in-title" className="mb-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h2 id="came-in-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
            What came in
          </h2>
          <p className="mt-1 max-w-[520px] text-[14px] leading-[1.5] text-fg-2">
            Last {STRIP_DAYS} days, a bar per day. Red needed you, amber was a heads-up, grey was routine. Tap a day to see only that day.
          </p>
        </div>
        <dl className="flex gap-8">
          <Stat label="Signals" value={String(inWindow.length)} />
          <Stat label="Needed you" value={String(needed)} tone={needed ? "red" : null} />
          {cents ? <Stat label="Charged" value={formatUsd(cents)} /> : <Stat label="Heads-ups" value={String(heads)} />}
        </dl>
      </div>

      <div className="rounded-2xl border border-line-2 bg-raised px-3 pt-4 pb-2 shadow-[inset_0_1px_0_var(--highlight)] sm:px-5">
        <div className="flex items-end gap-[3px] sm:gap-1" style={{ height: H }} role="group" aria-label="Signals per day">
          {days.map((d) => {
            const total = d.red + d.amber + d.quiet;
            const active = shown?.key === d.key;
            const px = (n: number) => (n ? Math.max(3, (n / max) * (H - 8)) : 0);
            return (
              <button
                key={d.key}
                type="button"
                disabled={!total}
                aria-pressed={picked === d.key}
                aria-label={`${label(d)}: ${total ? sentence(d) : "nothing"}`}
                onMouseEnter={() => setHover(d.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(d.key)}
                onBlur={() => setHover(null)}
                onClick={() => onPick(picked === d.key ? null : d.key)}
                className={`group relative flex h-full min-w-0 flex-1 flex-col-reverse items-stretch rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${total ? "cursor-pointer" : "cursor-default"} ${active ? "bg-raised-2" : ""}`}
              >
                {/* An empty day still shows as a hairline, so a quiet month reads as quiet, not missing. */}
                {total ? null : <span className="h-px bg-line-2" />}
                <span className="rounded-b-[2px] bg-fg-3/70" style={{ height: px(d.quiet) }} />
                <span className="bg-amber" style={{ height: px(d.amber) }} />
                <span className="rounded-t-[2px] bg-red" style={{ height: px(d.red) }} />
                {picked && picked !== d.key ? <span className="absolute inset-0 bg-raised/55" /> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-fg-3" aria-hidden>
          <span className="num">{new Date(days[0].start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span className="num">{new Date(days[15].start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span>today</span>
        </div>
      </div>

      <p className="mt-3 min-h-6 text-[14px] text-fg-2" aria-live="polite">
        {shown ? (
          <>
            <span className="text-fg">{label(shown)}:</span> {shown.red + shown.amber + shown.quiet ? sentence(shown) : "nothing came in"}.
            {picked === shown.key ? (
              <button type="button" onClick={() => onPick(null)} className="ml-2 inline-flex min-h-11 items-center text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
                Show every day
              </button>
            ) : null}
          </>
        ) : partialSince ? (
          `The list holds signals since ${new Date(partialSince).toLocaleDateString(undefined, { month: "short", day: "numeric" })}; show older below to fill in the rest.`
        ) : null}
      </p>
    </section>
  );
}

function Stat({ label, value, tone = null }: { label: string; value: string; tone?: "red" | null }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-[12px] text-fg-3">{label}</dt>
      <dd className={`num text-[28px] leading-none font-medium tracking-[-0.02em] ${tone === "red" ? "text-red" : "text-fg"}`}>{value}</dd>
    </div>
  );
}
