"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { INCIDENT } from "./incident";

/**
 * The hero: one recorder trace, full bleed. It replays a real failure on this site's own
 * production (Nov 9, UTC): the line beats once at every 5-minute check, spikes when the deploy
 * of 149449c fails, sits raised and red while it is broken, and drops back when the fix goes
 * live. The failure sits just right of the hero text, so the spike rises beside the sentence
 * and the notes fill the space to its right.
 *
 * A write head draws it once on load: fast to the failure, a held beat there, on to the fix,
 * a held beat, then out. Each note lands as the head passes. Under the axis, a live readout
 * from /api/health/watch says when our watcher last ran. The pointer reads the time under it.
 * Reduced motion: drawn in full, still. Below 1280 px a shorter window with the notes under it.
 */

const BASE = 0.8; // healthy, as a share of the height
const RAISED = 0.56; // broken
const PEAK = 0.02; // the failure

const secs = (hhmmss: string) => {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};
const clock = (t: number) => [Math.floor(t / 3600), Math.floor((t % 3600) / 60), Math.floor(t % 60)].map((v) => String(v).padStart(2, "0")).join(":");
const CHECK_TIMES = ["22:15:00", "22:20:00", "22:25:00", "22:30:00", "22:35:00", "22:40:00", "22:45:00", "22:50:00"].map(secs);

type Geo = { w: number; h: number; from: number; to: number };

/** 0.9 px a second: the failure lands at x 660, just right of the sentence and the buttons. */
const DESKTOP: Geo = { w: 1440, h: 380, from: secs("22:30:55") - 660 / 0.9, to: secs("22:30:55") + (1440 - 660) / 0.9 };
const PHONE: Geo = { w: 390, h: 240, from: secs("22:28:10"), to: secs("22:43:30") };

function geometry(g: Geo) {
  const X = (t: number) => ((t - g.from) / (g.to - g.from)) * g.w;
  const y = (share: number) => share * g.h;
  const xf = X(secs(INCIDENT.failed.failedAt));
  const xr = X(secs(INCIDENT.fixed.readyAt));
  const checks = CHECK_TIMES.filter((t) => t > g.from && t < g.to).map((t) => ({ t, x: X(t) }));
  const blip = (bx: number, by: number) => `L${bx - 5} ${by} L${bx - 1.5} ${by - 15} L${bx + 2} ${by + 7} L${bx + 5} ${by}`;
  const events = [...checks.map((c) => ({ at: c.x, kind: "check" as const })), { at: xf, kind: "fail" as const }, { at: xr, kind: "fix" as const }].sort((p, q) => p.at - q.at);
  const B = y(BASE);
  const R = y(RAISED);
  const parts = [`M-40 ${B}`];
  for (const e of events) {
    if (e.kind === "check") parts.push(blip(e.at, e.at > xf && e.at < xr ? R : B));
    else if (e.kind === "fail") parts.push(`L${xf - 3} ${B} L${xf} ${y(PEAK)} L${xf + 5} ${B + 26} L${xf + 11} ${R - 10} L${xf + 18} ${R}`);
    else parts.push(`L${xr - 4} ${R} L${xr} ${R - 18} L${xr + 6} ${B + 12} L${xr + 12} ${B}`);
  }
  parts.push(`L${g.w + 40} ${B}`);
  return { X, xf, xr, checks, base: B, raised: R, peak: y(PEAK), path: parts.join(" "), blip };
}

type Health = { lastRunAt: string | null };

/** Our own watcher's last run, from the public health endpoint, and a clock that ticks. */
export function useWatch() {
  const [last, setLast] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/health/watch", { cache: "no-store" })
        .then((r) => r.json() as Promise<Health>)
        .then((d) => {
          if (alive && d.lastRunAt) setLast(Date.parse(d.lastRunAt));
        })
        .catch(() => {});
    load();
    const poll = setInterval(load, 60_000);
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);
  return { last, now };
}

export const fmtAge = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`);

/**
 * Where the write head is, in trace x, over time: a list of [ms after load, x] stops, eased out
 * within each leg so it lands on each event and holds. Reduced motion: the last stop at once.
 */
function usePen(stops: [number, number][]) {
  const last = stops[stops.length - 1][1];
  const [x, setX] = useState(stops[0][1]);
  const key = stops.map((s) => s.join(",")).join(";");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setX(last);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const ease = (v: number) => 1 - Math.pow(1 - v, 3);
    const step = (now: number) => {
      const t = now - t0;
      let i = 0;
      while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
      if (i >= stops.length - 1) {
        setX(last);
        return;
      }
      const [ta, xa] = stops[i];
      const [tb, xb] = stops[i + 1];
      setX(xa + (xb - xa) * ease(Math.min(1, Math.max(0, (t - ta) / (tb - ta)))));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { x, done: x >= last };
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function Note({ show, tone, kicker, children, className = "", style }: { show: boolean; tone: "red" | "live" | "dim"; kicker: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`absolute transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${show ? "opacity-100" : "translate-y-1 opacity-0"} ${className}`} style={style}>
      <p className={`font-mono text-[13px] ${tone === "red" ? "text-red" : tone === "live" ? "text-live" : "text-fg-3"}`}>{kicker}</p>
      <div className="mt-1.5 text-[16px] leading-[1.45] text-fg">{children}</div>
    </div>
  );
}

const CAUSE_TONE = "text-cause";

export function SignalTrace() {
  const { last, now } = useWatch();
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const d = useMemo(() => geometry(DESKTOP), []);
  const m = useMemo(() => geometry(PHONE), []);
  const W = DESKTOP.w;
  const H = DESKTOP.h;
  const pen = usePen([
    [150, -40],
    [950, d.xf + 2],
    [1550, d.xf + 2],
    [2900, d.xr + 2],
    [3300, d.xr + 2],
    [4000, W + 40],
  ]);
  const penM = usePen([
    [150, -20],
    [950, m.xf + 2],
    [1550, m.xf + 2],
    [2700, m.xr + 2],
    [3100, m.xr + 2],
    [3600, PHONE.w + 20],
  ]);
  const age = last && now ? Math.max(0, Math.round((now - last) / 1000)) : null;

  const timeAt = (px: number) => clock(DESKTOP.from + (px / W) * (DESKTOP.to - DESKTOP.from));
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setHover(((e.clientX - r.left) / r.width) * W);
  };
  const head = pen.done ? hover : pen.x;

  const label = `A replay of a real failure on this site: on ${INCIDENT.date} the production deploy of ${INCIDENT.failed.commit} failed in ${INCIDENT.failed.seconds} seconds. The alert named the cause from the build log, “${INCIDENT.cause}”. The fix ${INCIDENT.fixed.commit} was live and working ${INCIDENT.minutesToFix} later. Our own watcher runs ${INCIDENT.schedule.every}.`;
  const strokes = { fill: "none", strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const caption = `Our own production on ${INCIDENT.date}, UTC, replayed through today’s 5-minute checks.`;
  const nowLine = age !== null ? `Watching now. Last check ${fmtAge(age)} ago.` : `Watching now, ${INCIDENT.schedule.every}.`;

  return (
    <div role="img" aria-label={label}>
      {/* 1280 px and up: the trace rises beside the hero text. */}
      <div ref={box} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="relative hidden select-none xl:block" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <clipPath id="trace-pen">
              <rect x={-60} y={-H} width={Math.max(0, pen.x + 60)} height={H * 3} />
            </clipPath>
            <clipPath id="trace-broken">
              <rect x={d.xf} y={-H} width={d.xr - d.xf} height={H * 3} />
            </clipPath>
            <filter id="trace-bloom" x="-5%" y="-20%" width="110%" height="140%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <linearGradient id="trace-head" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--fg)" stopOpacity="0" />
              <stop offset="0.5" stopColor="var(--fg)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--fg)" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="trace-wash" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--red)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--red)" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* the axis: one hairline and the real 5-minute check times */}
          <line x1={-40} x2={W + 40} y1={d.base + 44} y2={d.base + 44} stroke="var(--line-2)" vectorEffect="non-scaling-stroke" />
          {d.checks.map((c) => (
            <line key={c.t} x1={c.x} x2={c.x} y1={d.base + 38} y2={d.base + 44} stroke="var(--line-3)" vectorEffect="non-scaling-stroke" />
          ))}

          <g clipPath="url(#trace-pen)">
            <rect x={d.xf} y={d.raised} width={d.xr - d.xf} height={d.base - d.raised} fill="url(#trace-wash)" />
            <path d={d.path} stroke="var(--fg)" strokeOpacity={0.9} strokeWidth={1.75} vectorEffect="non-scaling-stroke" {...strokes} />
            <path d={d.path} stroke="var(--red)" strokeOpacity={0.55} strokeWidth={9} vectorEffect="non-scaling-stroke" clipPath="url(#trace-broken)" filter="url(#trace-bloom)" {...strokes} />
            <path d={d.path} stroke="var(--red)" strokeWidth={2.25} vectorEffect="non-scaling-stroke" clipPath="url(#trace-broken)" {...strokes} />
          </g>

          {pen.x > d.xf ? <circle cx={d.xf} cy={d.peak} r={4} fill="var(--red)" className="trace-dot" /> : null}
          {pen.x > d.xr ? (
            <>
              <circle cx={d.xr} cy={d.raised - 18} r={14} fill="var(--live)" opacity={0.18} className="trace-ring" />
              <circle cx={d.xr} cy={d.raised - 18} r={4.5} fill="var(--live)" className="trace-dot" />
            </>
          ) : null}

          {head !== null ? <rect x={head - 0.75} y={-8} width={1.5} height={d.base + 52} fill="url(#trace-head)" /> : null}
        </svg>

        {d.checks.map((c) => (
          <span key={c.t} className="absolute font-mono text-[11px] text-fg-3" style={{ left: pct(c.x, W), top: d.base + 50, transform: "translateX(-50%)" }}>
            {clock(c.t).slice(0, 5)}
          </span>
        ))}

        {pen.done && hover !== null ? (
          <span className="pointer-events-none absolute font-mono text-[11px] whitespace-pre text-fg-2 tabular-nums" style={{ left: pct(hover, W), top: -24, transform: "translateX(-50%)" }}>
            Nov 9  {timeAt(hover)} UTC
          </span>
        ) : null}

        <Note show={pen.x > d.xf} tone="red" kicker={`${INCIDENT.failed.failedAt} UTC`} style={{ left: pct(d.xf + 26, W), top: d.peak - 6 }} className="w-[400px]">
          Production build failed in {INCIDENT.failed.seconds} s.
        </Note>
        <Note show={pen.x > d.xf + 60} tone="dim" kicker="Cause, from the build log" style={{ left: pct(d.xf + 26, W), top: d.peak + 70 }} className="w-[400px]">
          <p className={`font-mono text-[14px] leading-[1.55] ${CAUSE_TONE}`}>{INCIDENT.cause}</p>
        </Note>
        <Note show={pen.x > d.xf + 200} tone="dim" kicker="Alert emailed" style={{ left: pct(d.xf + 26, W), top: d.raised + 22 }} className="w-[440px]">
          “{INCIDENT.subject}”
        </Note>
        <Note show={pen.x > d.xr} tone="live" kicker={`${INCIDENT.fixed.readyAt} UTC`} style={{ right: pct(W - d.xr + 22, W), top: d.peak - 6 }} className="text-right whitespace-nowrap">
          Working again, {INCIDENT.minutesToFix} later.
        </Note>

        <div className="absolute inset-x-0 mx-auto flex max-w-6xl items-baseline justify-between gap-6 px-8 font-mono text-[11px] text-fg-3" style={{ top: d.base + 76 }}>
          <p>{caption}</p>
          <p className={`flex items-center gap-2 text-fg-2 transition-opacity duration-500 ${pen.done ? "opacity-100" : "opacity-0"}`}>
            <span className="trace-pen inline-block size-1.5 rounded-full bg-live" aria-hidden />
            {nowLine}
          </p>
        </div>
      </div>

      {/* Below 1280 px: the incident window, two notes on the line, the rest under it. */}
      <div className="xl:hidden">
        <div className="relative select-none" style={{ height: PHONE.h }}>
          <svg viewBox={`0 0 ${PHONE.w} ${PHONE.h}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <defs>
              <clipPath id="trace-pen-m">
                <rect x={-40} y={-60} width={Math.max(0, penM.x + 40)} height={PHONE.h + 120} />
              </clipPath>
              <clipPath id="trace-broken-m">
                <rect x={m.xf} y={-60} width={m.xr - m.xf} height={PHONE.h + 120} />
              </clipPath>
            </defs>
            <line x1={-40} x2={PHONE.w + 40} y1={m.base + 30} y2={m.base + 30} stroke="var(--line-2)" vectorEffect="non-scaling-stroke" />
            <g clipPath="url(#trace-pen-m)">
              <rect x={m.xf} y={m.raised} width={m.xr - m.xf} height={m.base - m.raised} fill="var(--red)" opacity={0.1} />
              <path d={m.path} stroke="var(--fg)" strokeOpacity={0.9} strokeWidth={1.75} vectorEffect="non-scaling-stroke" {...strokes} />
              <path d={m.path} stroke="var(--red)" strokeWidth={2.25} vectorEffect="non-scaling-stroke" clipPath="url(#trace-broken-m)" {...strokes} />
            </g>
            {penM.x > m.xf ? <circle cx={m.xf} cy={m.peak} r={3.5} fill="var(--red)" /> : null}
            {penM.x > m.xr ? <circle cx={m.xr} cy={m.raised - 18} r={3.5} fill="var(--live)" /> : null}
          </svg>
          {m.checks.map((c) => (
            <span key={c.t} className="absolute font-mono text-[11px] text-fg-3" style={{ left: pct(c.x, PHONE.w), top: m.base + 34, transform: "translateX(-50%)" }}>
              {clock(c.t).slice(0, 5)}
            </span>
          ))}
          <Note show={penM.x > m.xf} tone="red" kicker={INCIDENT.failed.failedAt} style={{ left: pct(m.xf + 12, PHONE.w), top: m.peak - 8 }} className="w-[150px]">
            Build failed.
          </Note>
          <Note show={penM.x > m.xr} tone="live" kicker={INCIDENT.fixed.readyAt} style={{ right: pct(PHONE.w - m.xr + 12, PHONE.w), top: m.raised - 76 }} className="text-right">
            Fixed.
          </Note>
        </div>
        <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 text-[14px] leading-[1.45] sm:px-8">
          <dt className="font-mono text-[12px] text-red">Failed</dt>
          <dd className="text-fg">
            Production, {INCIDENT.failed.commit}, in {INCIDENT.failed.seconds} s.
          </dd>
          <dt className="font-mono text-[12px] text-fg-3">Cause</dt>
          <dd className={`font-mono text-[13px] [overflow-wrap:anywhere] ${CAUSE_TONE}`}>{INCIDENT.cause}</dd>
          <dt className="font-mono text-[12px] text-fg-3">Emailed</dt>
          <dd className="text-fg">“{INCIDENT.subject}”</dd>
          <dt className="font-mono text-[12px] text-live">Fixed</dt>
          <dd className="text-fg">Working again {INCIDENT.minutesToFix} later.</dd>
          <dt className="font-mono text-[12px] text-live">Now</dt>
          <dd className="text-fg">{age !== null ? `Last check ${fmtAge(age)} ago.` : `Checking ${INCIDENT.schedule.every}.`}</dd>
        </dl>
        <p className="mx-auto mt-6 max-w-2xl px-4 font-mono text-[11px] text-fg-3 sm:px-8">{caption}</p>
      </div>
    </div>
  );
}
