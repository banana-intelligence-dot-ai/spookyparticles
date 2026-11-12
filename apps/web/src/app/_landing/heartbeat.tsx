"use client";
import { fmtAge, useWatch } from "./signal-trace";

/**
 * The hero's line once more, before the sign-in: the last hour of our own watcher, one beat at
 * each real run (every 5 minutes back from the last run /api/health/watch reports). Full bleed,
 * still apart from the pen; nothing is drawn until the time is known.
 */
const W = 1440;
const H = 48;
const Y = 30;
const PEN = 1300;
const SPAN = 60 * 60 * 1000;

export function Heartbeat() {
  const { last, now } = useWatch();
  if (!last || !now) return <div aria-hidden style={{ height: H + 28 }} />;
  const beats: number[] = [];
  for (let t = last; now - t <= SPAN; t -= 5 * 60 * 1000) beats.push(PEN - ((now - t) / SPAN) * PEN);
  const d = [`M-20 ${Y}`, ...beats.sort((a, b) => a - b).filter((x) => x > 6 && x < PEN - 4).map((x) => `L${x - 5} ${Y} L${x - 1.5} ${Y - 14} L${x + 2} ${Y + 6} L${x + 5} ${Y}`), `L${PEN} ${Y}`].join(" ");
  const age = Math.max(0, Math.round((now - last) / 1000));
  return (
    <div className="relative" style={{ height: H + 28 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-12 w-full overflow-visible" aria-hidden>
        <path d={d} fill="none" stroke="var(--fg)" strokeOpacity={0.6} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={PEN} cy={Y} r={3.5} fill="var(--live)" className="trace-pen" />
      </svg>
      <p className="absolute top-14 font-mono text-[12px] text-fg-3" style={{ right: `${((W - PEN) / W) * 100}%` }}>
        Our watcher, last hour. Last check {fmtAge(age)} ago.
      </p>
    </div>
  );
}
