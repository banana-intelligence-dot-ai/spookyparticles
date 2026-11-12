"use client";
/**
 * Three candidate directions for the landing chart, on one shared sample account.
 * Development-only mockups: one is picked, then it replaces the live constellation.
 * Each keeps the one reactive surface (a lamp that follows a fine pointer, off on touch
 * and under Reduce Motion) and lights what is tied to whatever the pointer is on.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { surface } from "@/components/ui";
import {
  ORPHAN,
  PROJECTS,
  QUIET_REPOS,
  TICKS,
  TOTAL_CENTS,
  ageT,
  ago,
  projectCents,
  quietAges,
  usd,
  type SampleProject,
} from "./sample";

const LAMP_R = 150;
const CHAR = 7.25; // Geist Mono at 12px

function useLamp() {
  const wrap = useRef<HTMLDivElement>(null);
  const lamp = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = wrap.current;
    const l = lamp.current;
    if (!el || !l) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let inside = false;
    const t = { x: 0, y: 0 };
    const p = { x: 0, y: 0 };
    const paint = () => {
      l.style.setProperty("--mx", `${p.x.toFixed(1)}px`);
      l.style.setProperty("--my", `${p.y.toFixed(1)}px`);
    };
    const tick = () => {
      p.x += (t.x - p.x) * 0.15;
      p.y += (t.y - p.y) * 0.15;
      paint();
      raf = Math.abs(t.x - p.x) > 0.5 || Math.abs(t.y - p.y) > 0.5 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      t.x = e.clientX - r.left;
      t.y = e.clientY - r.top;
      if (!inside) {
        inside = true;
        p.x = t.x;
        p.y = t.y;
        l.style.opacity = "1";
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => {
      inside = false;
      l.style.opacity = "0";
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);
  return { wrap, lamp };
}

function Lamp({ lampRef }: { lampRef: React.RefObject<HTMLSpanElement | null> }) {
  return (
    <span
      ref={lampRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out"
      style={{ opacity: 0, background: `radial-gradient(${LAMP_R * 2}px circle at var(--mx, -999px) var(--my, -999px), var(--lamp), transparent 70%)` }}
    />
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/* ------------------------------------------------------------------ frame */

function Key({ kind, children }: { kind: "repo" | "live" | "failed" | "due" | "bill"; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden>
        {kind === "bill" ? (
          <circle cx="8" cy="8" r="4.5" fill="none" stroke="var(--fg)" strokeWidth="1.4" />
        ) : (
          <circle cx="8" cy="8" r="3.5" fill={kind === "repo" ? "var(--fg)" : kind === "live" ? "var(--live)" : kind === "failed" ? "var(--red)" : "var(--amber)"} />
        )}
      </svg>
      {children}
    </span>
  );
}

function Frame({
  title,
  sub,
  keys,
  children,
  foot,
  caption,
}: {
  title: string;
  sub: string;
  keys: ReactNode;
  children: ReactNode;
  foot: ReactNode;
  caption: string;
}) {
  return (
    <figure>
      <div className={`overflow-hidden ${surface}`}>
        <div className="border-b border-line-1 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="text-[16px] leading-[1.4] font-medium text-balance text-fg">{title}</h2>
          </div>
          <p className="mt-0.5 max-w-[72ch] text-[14px] text-pretty text-fg-2">{sub}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-2">
            {keys}
            <span className="ml-auto rounded-full border border-line-2 px-2 py-0.5 whitespace-nowrap">Sample account</span>
          </div>
        </div>
        {children}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line-1 px-4 py-3 text-[14px] text-fg-2 sm:px-6">{foot}</div>
      </div>
      <figcaption className="mt-6 grid gap-x-12 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="font-mono text-[20px] leading-[1.3] tracking-[-0.01em] text-fg">“Spooky action at a distance.”</p>
          <p className="mt-1 text-[14px] text-fg-2">Albert Einstein, in a letter to Max Born, 1947</p>
        </div>
        <p className="max-w-[48ch] text-[16px] leading-[1.5] text-pretty text-fg-2">{caption}</p>
      </figcaption>
    </figure>
  );
}

const Foot = () => (
  <>
    <span>
      + {QUIET_REPOS} repos with nothing deployed or billed
    </span>
    <span>
      <span className="num font-mono text-fg">{usd(TOTAL_CENTS)}</span>/mo across 5 bills, 1 project unknown
    </span>
  </>
);

/* ------------------------------------------------------------------ 1. wiring */

type Stage = { label: string; sub: string | null; tone: "fg" | "live" | "red" | "amber" | "dim"; missing?: boolean; ring?: number };

function stages(p: SampleProject): Stage[] {
  const cents = projectCents(p);
  return [
    { label: p.repo, sub: `pushed ${ago(p.pushed)}`, tone: p.idlePaid ? "dim" : "fg" },
    { label: p.host ?? "not deployed", sub: p.deployNote, tone: p.deploy === "failed" ? "red" : p.deploy === "live" ? "live" : "dim", missing: !p.host },
    {
      label: p.domain ?? p.domainNote ?? "no domain",
      sub: p.domain ? p.domainNote : null,
      tone: p.domainDue ? "amber" : p.domain ? "fg" : "dim",
      missing: !p.domain,
    },
    {
      label: p.bills.length ? p.bills.map((b) => `${b.vendor} ${b.plan}`).join(" + ") : "no receipt found",
      sub: p.bills.length > 1 ? p.bills.map((b) => usd(b.cents)).join(" + ") : null,
      tone: p.bills.length ? "fg" : "dim",
      missing: !p.bills.length,
      ring: cents,
    },
  ];
}

const ORPHAN_STAGES: Stage[] = [
  { label: "no repo found", sub: null, tone: "dim", missing: true },
  { label: ORPHAN.vendor, sub: "nothing deployed", tone: "dim" },
  { label: "no domain", sub: null, tone: "dim", missing: true },
  { label: `${ORPHAN.vendor} ${ORPHAN.plan}`, sub: null, tone: "fg", ring: ORPHAN.cents },
];

const TONE: Record<Stage["tone"], string> = { fg: "var(--fg)", live: "var(--live)", red: "var(--red)", amber: "var(--amber)", dim: "var(--fg-3)" };
/** Ring area tracks the monthly amount, so $45 reads clearly bigger than $7. */
const ringR = (cents: number) => Math.min(9, 2 + Math.sqrt(cents / 100) * 0.85);

function Node({ s, i }: { s: Stage; i: number }) {
  if (s.missing) return <circle cx="10" cy="10" r="3" fill="none" stroke="var(--fg-3)" strokeWidth="1.2" strokeDasharray="1.5 1.5" />;
  if (i === 3 && s.ring) return <circle cx="10" cy="10" r={ringR(s.ring)} fill="none" stroke="var(--fg)" strokeWidth="1.4" />;
  if (s.tone === "red")
    return (
      <>
        <circle cx="10" cy="10" r="6.5" fill="none" stroke="var(--red)" strokeWidth="1" />
        <circle cx="10" cy="10" r="3.5" fill="var(--red)" />
      </>
    );
  return <circle cx="10" cy="10" r="3.5" fill={TONE[s.tone]} />;
}

type RowData = { key: string; st: Stage[]; cents: number; note: string | null; noteTone: string };

const ROWS: RowData[] = [
  ...PROJECTS.map((p) => ({
    key: p.repo,
    st: stages(p),
    cents: projectCents(p),
    note: p.deploy === "failed" ? "deploy failed" : p.idlePaid ? `idle ${ago(p.pushed).replace(" ago", "")}, still billed` : !p.bills.length ? "no receipt yet" : null,
    noteTone: p.deploy === "failed" ? "text-red" : "text-fg-2",
  })),
  { key: "orphan", st: ORPHAN_STAGES, cents: ORPHAN.cents, note: "paid, nothing runs", noteTone: "text-fg-2" },
];

const HEADS = ["Repo", "Runs on", "Domain", "Bills"];

export function Wiring() {
  const { wrap, lamp } = useLamp();
  const [active, setActive] = useState<string | null>(null);
  const dim = (k: string) => (active && active !== k ? "opacity-35" : "opacity-100");
  return (
    <Frame
      title="Every project, wired end to end"
      sub="One row per project: the repo, where it runs, the domain it answers on, and the bills that pay for it. Read from GitHub and your inbox."
      keys={
        <>
          <Key kind="live">Live</Key>
          <Key kind="failed">Failed deploy</Key>
          <Key kind="due">Needs you</Key>
          <Key kind="bill">Bill, sized by cost</Key>
        </>
      }
      foot={<Foot />}
      caption="Touch one thing and everything wired to it lights up: the repo, the host, the domain, the bill. Each from its own provider and login. This one’s a sample; yours is drawn from your own accounts."
    >
      <div ref={wrap} className="relative" onPointerLeave={() => setActive(null)}>
        <Lamp lampRef={lamp} />
        {/* Wide: four stations on one wire per row. */}
        <div className="relative hidden px-6 pt-4 pb-2 sm:block">
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1.1fr)_minmax(0,1.35fr)_7.5rem] pb-2 text-[12px] text-fg-2">
            {HEADS.map((h) => (
              <span key={h}>{h}</span>
            ))}
            <span className="text-right">Per month</span>
          </div>
          <ul>
            {ROWS.map((r) => (
              <li
                key={r.key}
                tabIndex={0}
                data-row={r.key}
                onPointerEnter={() => setActive(r.key)}
                onClick={() => setActive(r.key)}
                onFocus={() => setActive(r.key)}
                onBlur={() => setActive(null)}
                className={`grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1.1fr)_minmax(0,1.35fr)_7.5rem] border-t border-line-1 py-4 outline-none transition-opacity duration-150 ease-out ${dim(r.key)}`}
              >
                {r.st.map((s, i) => {
                  const next = r.st[i + 1];
                  const solid = next && !next.missing && !s.missing;
                  return (
                    <div key={i} className="min-w-0 pr-4">
                      <div className="relative flex h-5 items-center">
                        {next ? (
                          <span
                            aria-hidden
                            className="absolute top-1/2 right-0 left-2.5 border-t transition-[border-color] duration-150"
                            style={{
                              borderStyle: solid ? "solid" : "dashed",
                              borderColor: `color-mix(in srgb, var(--fg) ${active === r.key ? 55 : 20}%, transparent)`,
                            }}
                          />
                        ) : null}
                        <svg viewBox="0 0 20 20" className="relative -ml-2 size-5 shrink-0 overflow-visible" aria-hidden>
                          <circle cx="10" cy="10" r={s.ring && i === 3 ? ringR(s.ring) + 2 : 7} fill="var(--bg)" />
                          <Node s={s} i={i} />
                        </svg>
                      </div>
                      <p className={`mt-2 truncate font-mono text-[14px] ${s.missing || s.tone === "dim" ? "text-fg-3" : "text-fg"}`} title={s.label}>
                        {s.label}
                      </p>
                      {s.sub ? (
                        <p className={`truncate text-[12px] ${s.tone === "red" ? "text-red" : s.tone === "amber" ? "text-amber" : "text-fg-2"}`}>{s.sub}</p>
                      ) : null}
                    </div>
                  );
                })}
                <div className="pt-6 text-right">
                  <p className="num font-mono text-[16px] text-fg">
                    {r.cents ? usd(r.cents) : "unknown"}
                    {r.cents ? <span className="text-[12px] text-fg-2">/mo</span> : null}
                  </p>
                  {r.note ? <p className={`text-[12px] text-balance ${r.noteTone}`}>{r.note}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Phone: the same wire, run top to bottom. */}
        <ul className="relative px-4 py-2 sm:hidden">
          {ROWS.map((r) => (
            <li key={r.key} tabIndex={0} onFocus={() => setActive(r.key)} onClick={() => setActive(active === r.key ? null : r.key)} className={`border-t border-line-1 py-3 outline-none first:border-t-0 transition-opacity duration-150 ${dim(r.key)}`}>
              <ol className="relative">
                <span aria-hidden className="absolute top-2.5 bottom-2.5 left-[9.5px] border-l border-line-3" />
                {r.st.map((s, i) => (
                  <li key={i} className="relative flex min-h-6 items-start gap-3">
                    <svg viewBox="0 0 20 20" className="relative mt-px size-5 shrink-0 overflow-visible" aria-hidden>
                      <circle cx="10" cy="10" r={s.ring && i === 3 ? ringR(s.ring) + 2 : 7} fill="var(--bg)" />
                      <Node s={s} i={i} />
                    </svg>
                    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                      <p className={`min-w-0 font-mono ${i === 0 ? "text-[14px]" : "text-[12px]"} ${s.missing || s.tone === "dim" ? "text-fg-3" : i === 0 ? "text-fg" : "text-code"}`}>
                        <span className="break-words">{s.label}</span>
                        {s.sub ? (
                          <>
                            {" "}
                            <span className={`font-sans whitespace-nowrap ${s.tone === "red" ? "text-red" : s.tone === "amber" ? "text-amber" : "text-fg-2"}`}>· {s.sub}</span>
                          </>
                        ) : null}
                      </p>
                      {i === 0 ? (
                        <span className="num shrink-0 font-mono text-[14px] text-fg">
                          {r.cents ? usd(r.cents) : "unknown"}
                          {r.cents ? <span className="text-[12px] text-fg-2">/mo</span> : null}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
              {r.note ? <p className={`mt-1 pl-7 text-[12px] ${r.noteTone}`}>{r.note}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ shared axis */

function timeAxis(w: number, padL: number, padR: number) {
  const x0 = padL;
  const x1 = w - padR;
  const x = (d: number) => x0 + ageT(d) * (x1 - x0);
  return { x0, x1, x };
}

/* ------------------------------------------------------------------ 2. orbits */

export function Orbits() {
  const { wrap, lamp } = useLamp();
  const { ref, w } = useWidth();
  const [active, setActive] = useState<string | null>(null);
  const narrow = w > 0 && w < 560;
  const h = narrow ? 420 : 400;
  const orphanW = narrow ? 72 : 128;
  const { x0, x1, x } = timeAxis(w, narrow ? 40 : 72, (narrow ? 16 : 24) + orphanW);
  const axisY = h - 44;
  const R = narrow ? 22 : 32;
  const lanes = narrow ? [96, 196, 290] : [104, 236];

  // Greedy lanes: each project takes the lane whose last cluster is farthest left of it.
  const placed: { p: SampleProject; cx: number; cy: number }[] = [];
  const laneEnd = lanes.map(() => -Infinity);
  for (const p of [...PROJECTS].sort((a, b) => a.pushed - b.pushed)) {
    const cx = Math.max(x0 + R + 12, x(p.pushed));
    let li = laneEnd.findIndex((e) => cx - e > (narrow ? 120 : 170));
    if (li < 0) li = laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[li] = cx;
    placed.push({ p, cx, cy: lanes[li] });
  }
  const quiet = quietAges()
    .map((d, i) => ({ d, y: 40 + ((i * 73) % 100) / 100 * (axisY - 64) }))
    .map((q) => ({ ...q, cx: x(q.d) }))
    .map((q) => (placed.some((c) => Math.hypot(c.cx - q.cx, c.cy - q.y) < R + 40) ? { ...q, y: Math.min(axisY - 10, q.y + R * 2 + 70) } : q));
  const ticks = narrow ? TICKS.filter((t) => [0, 30, 365].includes(t.d)) : TICKS;
  const orphanX = w - (narrow ? 16 : 24) - orphanW / 2;

  return (
    <Frame
      title="Every project, by when you last pushed"
      sub="Each cluster is one project: the repo in the middle, with where it runs, its domain and its bills around it. Further right, longer since you touched it."
      keys={
        <>
          <Key kind="repo">Repo</Key>
          <Key kind="live">Live deploy</Key>
          <Key kind="failed">Failed deploy</Key>
          <Key kind="due">Needs you</Key>
          <Key kind="bill">Bill, sized by cost</Key>
        </>
      }
      foot={<Foot />}
      caption="Point at a project and what’s tied to it lights up, across every provider and login. Faint points are repos with nothing running. This one’s a sample; yours is drawn from your own accounts."
    >
      <div ref={wrap} className="relative">
        <Lamp lampRef={lamp} />
        <div ref={ref} className="relative">
          {w ? (
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block select-none" onPointerLeave={() => setActive(null)} role="img" aria-label="Sample: four projects placed by last push, with their deploys, domains and bills">
              {/* axis */}
              <g stroke="var(--fg)" strokeOpacity="0.07" strokeDasharray="2 4">
                {ticks.map((t) => (
                  <line key={t.d} x1={x(t.d)} x2={x(t.d)} y1={24} y2={axisY} />
                ))}
                <line x1={x1 + 16} x2={x1 + 16} y1={24} y2={axisY + 24} />
              </g>
              <line x1={x0} x2={x1} y1={axisY} y2={axisY} stroke="var(--line-3)" />
              <g fontSize="12" fill="var(--fg-2)">
                {ticks.map((t, i) => (
                  <text key={t.d} x={x(t.d)} y={axisY + 20} textAnchor={i === 0 ? "start" : "middle"}>
                    {t.label}
                  </text>
                ))}
                <text x={x0} y={axisY + 38} fill="var(--fg-3)">
                  Last push →
                </text>
                <text x={orphanX} y={40} textAnchor="middle" fill="var(--fg-3)">
                  No repo
                </text>
              </g>

              {/* quiet repos */}
              <g fill="var(--fg)" fillOpacity="0.22">
                {quiet.map((q, i) => (
                  <circle key={i} cx={q.cx} cy={q.y} r={1.6} />
                ))}
              </g>

              {/* clusters */}
              {placed.map(({ p, cx, cy }) => {
                const on = active === p.repo;
                const off = active && !on;
                const sats: { a: number; el: ReactNode }[] = [];
                if (p.host)
                  sats.push({
                    a: -150,
                    el:
                      p.deploy === "failed" ? (
                        <>
                          <circle r={6.5} fill="none" stroke="var(--red)" />
                          <circle r={3.5} fill="var(--red)" />
                        </>
                      ) : (
                        <circle r={3.5} fill="var(--live)" />
                      ),
                  });
                if (p.domain) sats.push({ a: -60, el: <circle r={3} fill={p.domainDue ? "var(--amber)" : "var(--fg)"} fillOpacity={p.domainDue ? 1 : 0.7} /> });
                p.bills.forEach((b, i) => sats.push({ a: 20 + i * 70, el: <circle r={ringR(b.cents)} fill="none" stroke="var(--fg)" strokeWidth="1.4" /> }));
                const cents = projectCents(p);
                const nameW = p.repo.length * CHAR;
                const lx = Math.min(Math.max(cx, nameW / 2 + 8), x1 + 8 - nameW / 2);
                return (
                  <g key={p.repo} onPointerEnter={() => setActive(p.repo)} style={{ opacity: off ? 0.3 : 1 }} className="transition-opacity duration-150 ease-out">
                    <circle cx={cx} cy={cy} r={R + 22} fill="transparent" />
                    <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--fg)" strokeOpacity={on ? 0.25 : 0.1} strokeDasharray="2 3" />
                    {sats.map((s, i) => {
                      const rad = (s.a * Math.PI) / 180;
                      const sx = cx + Math.cos(rad) * R;
                      const sy = cy + Math.sin(rad) * R;
                      return (
                        <g key={i}>
                          <line x1={cx} y1={cy} x2={sx} y2={sy} stroke="var(--fg)" strokeOpacity={on ? 0.5 : 0.18} />
                          <g transform={`translate(${sx} ${sy})`}>{s.el}</g>
                        </g>
                      );
                    })}
                    <circle cx={cx} cy={cy} r={4} fill={p.idlePaid ? "var(--fg-2)" : "var(--fg)"} />
                    <text x={lx} y={cy + R + 22} textAnchor="middle" fontSize="12" fill="var(--fg)" className="font-mono">
                      {p.repo}
                    </text>
                    <text x={lx} y={cy + R + 38} textAnchor="middle" fontSize="12" fill="var(--fg-2)">
                      <tspan className="num">{cents ? `${usd(cents)}/mo` : "cost unknown"}</tspan>
                      {p.deploy === "failed" ? <tspan fill="var(--red)"> · deploy failed</tspan> : null}
                      {p.domainDue && !narrow ? <tspan fill="var(--amber)"> · domain renews in 9d</tspan> : null}
                    </text>
                  </g>
                );
              })}

              {/* the bill with no project */}
              <g>
                <circle cx={orphanX} cy={lanes[0]} r={ringR(ORPHAN.cents)} fill="none" stroke="var(--fg)" strokeWidth="1.4" />
                <text x={orphanX} y={lanes[0] + 26} textAnchor="middle" fontSize="12" fill="var(--fg)" className="font-mono">
                  {ORPHAN.vendor}
                </text>
                <text x={orphanX} y={lanes[0] + 42} textAnchor="middle" fontSize="12" fill="var(--fg-2)" className="num">
                  {usd(ORPHAN.cents)}/mo
                </text>
              </g>
            </svg>
          ) : (
            <div style={{ height: h }} />
          )}
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ 3. ledger */

export function Ledger() {
  const { wrap, lamp } = useLamp();
  const { ref, w } = useWidth();
  const [active, setActive] = useState<string>("you/blog-2024");
  const narrow = w > 0 && w < 560;
  const h = narrow ? 340 : 380;
  const orphanW = narrow ? 56 : 104;
  const padR = (narrow ? 16 : 24) + orphanW;
  const { x0, x1, x } = timeAxis(w, narrow ? 48 : 72, padR);
  const top = 36;
  const axisY = h - 52;
  const MAX = 5000;
  const y = (c: number) => axisY - (Math.min(c, MAX) / MAX) * (axisY - top);
  const ticks = narrow ? TICKS.filter((t) => [0, 30, 365].includes(t.d)) : TICKS;
  const orphanX = w - (narrow ? 16 : 24) - orphanW / 2;
  const quiet = quietAges();
  const pts = PROJECTS.map((p) => ({ p, cx: x(p.pushed), cy: y(projectCents(p)) }));
  const sel = pts.find((q) => q.p.repo === active) ?? null;

  return (
    <Frame
      title="What each project costs, and when you last touched it"
      sub="One point per project. Up is what it costs a month; right is how long since you pushed. Top right is paid and forgotten."
      keys={
        <>
          <Key kind="repo">Project</Key>
          <Key kind="failed">Failed deploy</Key>
          <Key kind="due">Needs you</Key>
          <Key kind="bill">Bill with no repo</Key>
        </>
      }
      foot={<Foot />}
      caption="Point at any project to see its whole stack: where it runs, its domain, its bills, each from its own provider and login. This one’s a sample; yours is drawn from your own accounts."
    >
      <div ref={wrap} className="relative">
        <Lamp lampRef={lamp} />
        <div ref={ref} className="relative">
          {w ? (
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block select-none" role="img" aria-label="Sample: projects by monthly cost and last push">
              {/* the forgotten zone */}
              <rect x={x(90)} y={top} width={x1 - x(90)} height={y(1000) - top} fill="var(--fg)" fillOpacity="0.025" />
              <text x={x1 - 8} y={top + 18} textAnchor="end" fontSize="12" fill="var(--fg-3)">
                {narrow ? "paid, idle 90d+" : "Paid, untouched 90+ days"}
              </text>
              {/* grid */}
              <g stroke="var(--fg)" strokeOpacity="0.07" strokeDasharray="2 4">
                {[2500, 5000].map((c) => (
                  <line key={c} x1={x0} x2={x1} y1={y(c)} y2={y(c)} />
                ))}
                {ticks.map((t) => (
                  <line key={t.d} x1={x(t.d)} x2={x(t.d)} y1={top} y2={axisY} />
                ))}
                <line x1={x1 + 16} x2={x1 + 16} y1={top} y2={axisY + 24} />
              </g>
              <line x1={x0} x2={x1} y1={axisY} y2={axisY} stroke="var(--line-3)" />
              <g fontSize="12" fill="var(--fg-2)" className="num">
                {[0, 2500, 5000].map((c) => (
                  <text key={c} x={x0 - 10} y={y(c) + 4} textAnchor="end" className="font-mono">
                    {usd(c)}
                  </text>
                ))}
                <text x={8} y={top - 16} fill="var(--fg-3)">
                  per month
                </text>
                {ticks.map((t, i) => (
                  <text key={t.d} x={x(t.d)} y={axisY + 20} textAnchor={i === 0 ? "start" : "middle"}>
                    {t.label}
                  </text>
                ))}
                <text x={x0} y={axisY + 40} fill="var(--fg-3)">
                  Last push →
                </text>
                <text x={orphanX} y={top + 4} textAnchor="middle" fill="var(--fg-3)">
                  No repo
                </text>
              </g>

              {/* repos with nothing billed sit on the $0 line */}
              <g fill="var(--fg)" fillOpacity="0.3">
                {quiet.map((d, i) => (
                  <circle key={i} cx={x(d)} cy={axisY} r={2} />
                ))}
              </g>

              {pts.map(({ p, cx, cy }) => {
                const on = active === p.repo;
                const fail = p.deploy === "failed";
                const label = narrow ? p.repo.replace("you/", "") : p.repo;
                const lw = label.length * CHAR;
                const right = cx + 12 + lw < x1;
                return (
                  <g key={p.repo} onPointerEnter={() => setActive(p.repo)} onClick={() => setActive(p.repo)} className="cursor-default">
                    <circle cx={cx} cy={cy} r={16} fill="transparent" />
                    {on ? <circle cx={cx} cy={cy} r={10} fill="none" stroke="var(--fg)" strokeOpacity="0.6" /> : null}
                    {fail ? <circle cx={cx} cy={cy} r={8} fill="none" stroke="var(--red)" /> : null}
                    <circle cx={cx} cy={cy} r={5} fill={fail ? "var(--red)" : p.domainDue ? "var(--amber)" : "var(--fg)"} />
                    <text x={right ? cx + 14 : cx - 14} y={cy - 8} opacity={on && !narrow ? 0 : 1} textAnchor={right ? "start" : "end"} fontSize="12" fill={on ? "var(--fg)" : "var(--fg-2)"} className="font-mono">
                      {label}
                    </text>
                  </g>
                );
              })}

              <g>
                <circle cx={orphanX} cy={y(ORPHAN.cents)} r={5} fill="none" stroke="var(--fg)" strokeWidth="1.4" />
                <text x={orphanX} y={y(ORPHAN.cents) - 12} textAnchor="middle" fontSize="12" fill="var(--fg-2)" className="font-mono">
                  {ORPHAN.vendor}
                </text>
              </g>
            </svg>
          ) : (
            <div style={{ height: h }} />
          )}
          {sel && w && !narrow ? <StackCard p={sel.p} cx={sel.cx} cy={sel.cy} w={w} /> : null}
        </div>
        {sel && narrow ? (
          <div className="relative border-t border-line-1 px-4 py-3">
            <StackBody p={sel.p} />
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

function StackBody({ p }: { p: SampleProject }) {
  const row = (k: string, v: ReactNode) => (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-fg-3">{k}</dt>
      <dd className="min-w-0 text-fg-2">{v}</dd>
    </div>
  );
  return (
    <div className="text-[12px]">
      <p className="font-mono text-[14px] text-fg">{p.repo}</p>
      <dl className="mt-2 space-y-1">
        {row("Last push", ago(p.pushed))}
        {row(
          "Runs on",
          <>
            {p.host ?? "nowhere"}
            {p.deployNote ? <span className={p.deploy === "failed" ? "text-red" : "text-live"}> · {p.deployNote}</span> : null}
          </>,
        )}
        {row(
          "Domain",
          <>
            <span className="font-mono">{p.domain ?? "none"}</span>
            {p.domainNote && p.domain ? <span className={p.domainDue ? "text-amber" : undefined}> · {p.domainNote}</span> : null}
          </>,
        )}
        {row("Bills", p.bills.length ? p.bills.map((b) => `${b.vendor} ${b.plan} ${usd(b.cents)}`).join(", ") : "no receipt found")}
      </dl>
    </div>
  );
}

/** Wide screens: the card floats above and left of its point, clear of the labels below. */
function StackCard({ p, cx, cy, w }: { p: SampleProject; cx: number; cy: number; w: number }) {
  const cw = 280;
  const ch = 150;
  const left = cx - cw - 24 > 8 ? cx - cw - 24 : Math.min(w - cw - 8, cx + 24);
  const top = Math.max(8, cy - ch / 2);
  return (
    <div className="pointer-events-none absolute rounded-lg border border-line-3 bg-bg/95 p-3 shadow-[inset_0_1px_0_var(--highlight)]" style={{ left, top, width: cw }}>
      <StackBody p={p} />
    </div>
  );
}
