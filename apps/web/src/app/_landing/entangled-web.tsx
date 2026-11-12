"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The entangled web, the landing page's hero. Repos on the left, what each one is tied to on the
 * right: host, domain, Actions run, deploy. Point at, tap or focus anything tied to it
 * answers at the same instant: one pulse of the accent runs down every wire at once (pathLength 1,
 * so near and far ends arrive together) and the far ends flash as it lands. The rest dims.
 * Nothing moves until you act. The pointer lamp is the only ambient light. Reduce Motion: no
 * pulse, no lamp, a plain highlight.
 * A sample account: generic project names, no one's data, and the panel says so.
 */

type Kind = "Hosts" | "Domains" | "Actions" | "Deploys";
type Tone = "red" | "amber";
type Node = { id: string; label: string; meta: string; kind?: Kind; tone?: Tone; missing?: boolean };

const REPOS: Node[] = [
  { id: "habit", label: "habit-tracker", meta: "deployed on Vercel" },
  { id: "trip", label: "trip-planner", meta: "still on Fly.io" },
  { id: "recipe", label: "recipe-box", meta: "deploy failed", tone: "red" },
  { id: "invoice", label: "invoice-bot", meta: "still on Railway", tone: "amber" },
  { id: "podcast", label: "pdf-to-podcast", meta: "still on Render", tone: "amber" },
  { id: "waitlist", label: "waitlist", meta: "scheduled job missed", tone: "amber" },
];

const THINGS: Node[] = [
  { id: "vw", kind: "Hosts", label: "Vercel", meta: "production" },
  { id: "vp", kind: "Hosts", label: "Vercel", meta: "preview" },
  { id: "fly", kind: "Hosts", label: "Fly.io", meta: "not on Vercel yet" },
  { id: "rw", kind: "Hosts", label: "Railway", meta: "not on Vercel yet" },
  { id: "rn", kind: "Hosts", label: "Render", meta: "not on Vercel yet" },
  { id: "dh", kind: "Domains", label: "habit.fyi", meta: "Vercel project" },
  { id: "di", kind: "Domains", label: "invoice-bot.app", meta: "Railway project" },
  { id: "ds", kind: "Actions", label: "GitHub Actions", meta: "job run" },
  { id: "bv", kind: "Deploys", label: "Vercel deploys", meta: "commits recorded" },
  { id: "br", kind: "Deploys", label: "invoice-bot", meta: "commit b2c3d4e" },
  { id: "bn", kind: "Deploys", label: "pdf-to-podcast", meta: "commit c3d4e5f" },
  { id: "bs", kind: "Deploys", label: "waitlist", meta: "commit d4e5f6a" },
  { id: "bx", kind: "Deploys", label: "no Vercel deploy", meta: "still on Fly.io", missing: true },
];

const EDGES: [string, string][] = [
  ["habit", "vw"],
  ["habit", "dh"],
  ["habit", "bv"],
  ["trip", "fly"],
  ["trip", "bx"],
  ["recipe", "vp"],
  ["recipe", "bv"],
  ["invoice", "rw"],
  ["invoice", "di"],
  ["invoice", "br"],
  ["podcast", "rn"],
  ["podcast", "bn"],
  ["waitlist", "vp"],
  ["waitlist", "ds"],
  ["waitlist", "bs"],
];

const READOUT: Record<string, string> = {
  habit: "Vercel deploy with its commit and domain. Open the project to check the source.",
  trip: "Still on Fly.io. Its row links to Vercel import and the migration guide.",
  recipe: "The Vercel deploy failed. The alert names the cause from its build log.",
  invoice: "Still on Railway. Its row links to Vercel import and the migration guide.",
  podcast: "Still on Render. Its row links to Vercel import and the migration guide.",
  waitlist: "A scheduled job missed its grace period. Its check-in alerts you when it runs again.",
};

const ALL = [...REPOS, ...THINGS];
const byId = (id: string) => ALL.find((n) => n.id === id)!;
const isRepo = (id: string) => REPOS.some((r) => r.id === id);
const touching = (id: string) => EDGES.filter(([a, b]) => a === id || b === id);
const tied = (id: string) => new Set(touching(id).flatMap(([a, b]) => [a, b]));

function readout(id: string) {
  if (READOUT[id]) return READOUT[id];
  const t = byId(id);
  const repos = EDGES.filter(([, b]) => b === id).map(([a]) => byId(a).label);
  if (t.missing) return `No Vercel deploy found for ${repos.join(" and ")}. Import link available.`;
  const who = repos.join(" and ");
  if (t.kind === "Hosts") return `${t.label} hosts ${who} in this sample.`;
  if (t.kind === "Domains") return `${t.label} points to ${who} in this sample.`;
  if (t.kind === "Actions") return `${t.label} ran for ${who} in this sample.`;
  return `${t.label} carries a commit for ${who} in this sample.`;
}

const TONE_TEXT: Record<Tone, string> = { red: "text-red", amber: "text-amber" };
const TONE_BG: Record<Tone, string> = { red: "bg-red", amber: "bg-amber" };

type Pt = { x: number; y: number };

const PULSE_MS = 460;
const PULSE_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
const DASH = 0.16;

export function EntangledWeb() {
  const [active, setActive] = useState("recipe");
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const pulses = useRef(new Map<string, SVGPathElement>());
  const [pts, setPts] = useState<Record<string, Pt>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const touched = useRef(false);
  // Phones: one repo open at a time, the broken one first.
  const [open, setOpen] = useState<string | null>("recipe");
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const rowTouched = useRef(false);
  // A tapped tie answers the other direction: what else goes down with it.
  const [tie, setTie] = useState<string | null>(null);
  const toggle = (id: string) => {
    rowTouched.current = true;
    setTie(null);
    setOpen((o) => (o === id ? null : id));
  };
  // Opening a row collapses the one above it, which can carry the tapped row off the top of the
  // screen. Bring it back into view before paint.
  useLayoutEffect(() => {
    if (!rowTouched.current || !open) return;
    rowRefs.current.get(open)?.scrollIntoView({ block: "nearest" });
  }, [open]);

  // The phone pulse: one run of the accent down the opened repo's wire, each tie lighting as it
  // passes. Only after a tap, never on load, never under Reduce Motion.
  useEffect(() => {
    if (!rowTouched.current || !open) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const row = rowRefs.current.get(open);
    if (!row) return;
    const run = row.querySelector<HTMLElement>("[data-run]");
    run?.animate(
      [
        { transform: "scaleY(0)", opacity: 1 },
        { transform: "scaleY(1)", opacity: 1, offset: 0.75 },
        { transform: "scaleY(1)", opacity: 0 },
      ],
      { duration: PULSE_MS * 1.2, easing: PULSE_EASE },
    );
    const dots = [...row.querySelectorAll<HTMLElement>("[data-tie-dot]")];
    dots.forEach((d, i) => {
      d.animate(
        [
          { backgroundColor: "var(--accent)", borderColor: "var(--accent)", boxShadow: "0 0 0 0 color-mix(in oklch, var(--accent) 55%, transparent)" },
          { boxShadow: "0 0 0 6px transparent" },
        ],
        { duration: 480, delay: ((i + 0.5) / dots.length) * PULSE_MS * 0.9, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
    });
  }, [open]);

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const o = el.getBoundingClientRect();
    const next: Record<string, Pt> = {};
    for (const n of ALL) {
      const r = refs.current.get(n.id)?.querySelector("[data-dot]")?.getBoundingClientRect();
      if (r) next[n.id] = { x: r.left + r.width / 2 - o.left, y: r.top + r.height / 2 - o.top };
    }
    setPts(next);
    setSize({ w: o.width, h: o.height });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    document.fonts?.ready.then(measure).catch(() => {});
    // A slow first load can lay out after the first measure without resizing the box.
    window.addEventListener("load", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", measure);
    };
  }, [measure]);

  // The pulse: only after the visitor acts, never on load, never under Reduce Motion.
  useEffect(() => {
    if (!touched.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fromRepo = isRepo(active);
    for (const [a, b] of touching(active)) {
      const p = pulses.current.get(a + b);
      if (!p) continue;
      // pathLength is 1, so every wire takes the same time: all far ends answer together.
      const frames = fromRepo
        ? [{ strokeDashoffset: DASH, opacity: 1 }, { strokeDashoffset: -1, opacity: 1 }]
        : [{ strokeDashoffset: -1, opacity: 1 }, { strokeDashoffset: DASH, opacity: 1 }];
      p.getAnimations().forEach((x) => x.cancel());
      p.animate(frames, { duration: PULSE_MS, easing: PULSE_EASE });
      const far = refs.current.get(fromRepo ? b : a)?.querySelector<HTMLElement>("[data-dot]");
      far?.getAnimations().forEach((x) => x.cancel());
      far?.animate(
        [
          { backgroundColor: "var(--accent)", borderColor: "var(--accent)", boxShadow: "0 0 0 0 color-mix(in oklch, var(--accent) 55%, transparent)" },
          { backgroundColor: "var(--fg)", borderColor: "var(--fg)", boxShadow: "0 0 0 7px transparent" },
        ],
        { duration: 520, delay: PULSE_MS * 0.82, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
    }
  }, [active]);

  // The lamp: lerped toward a fine pointer (0.15 a frame), off on touch and under Reduce Motion.
  const lamp = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const l = lamp.current;
    if (!el || !l) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
      raf = Math.abs(t.x - p.x) + Math.abs(t.y - p.y) > 0.5 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      const o = el.getBoundingClientRect();
      t.x = e.clientX - o.left;
      t.y = e.clientY - o.top;
      if (!inside) {
        inside = true;
        p.x = t.x;
        p.y = t.y;
        paint();
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
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);

  const lit = tied(active);
  const on = (id: string) => id === active || lit.has(id);
  const tone = byId(active).tone;

  const pick = (id: string) => {
    touched.current = true;
    setActive(id);
  };
  const nodeProps = (id: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) refs.current.set(id, el);
    },
    onPointerEnter: () => pick(id),
    onFocus: () => pick(id),
    onClick: () => pick(id),
    "aria-pressed": active === id,
  });

  return (
    <figure>
      <div className="slab relative overflow-hidden rounded-2xl">
        <div className="relative flex items-center justify-between gap-3 border-b border-line-1 px-4 py-3 md:px-6">
          <ul className="flex min-w-0 items-center gap-x-4 text-[12px] whitespace-nowrap text-fg-2 md:gap-x-5">
            <li className="inline-flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-red" />
              Broken
            </li>
            <li className="inline-flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-amber" />
              Needs you
            </li>
            <li className="inline-flex items-center gap-2">
              <span aria-hidden className="size-2 rounded-full border border-dashed border-fg-2" />
              Not found yet
            </li>
          </ul>
          <SampleTag className="hidden md:block" />
        </div>

        <RepoRows open={open} tie={tie} onToggle={toggle} onTie={setTie} rowRefs={rowRefs} />

        <div ref={box} className="relative hidden md:block">
          <div
            ref={lamp}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 ease-out"
            style={{ background: "radial-gradient(320px circle at var(--mx, -999px) var(--my, -999px), var(--lamp), transparent 70%)" }}
          />
          <svg aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" width={size.w} height={size.h}>
            {EDGES.map(([a, b]) => {
              const p = pts[a];
              const q = pts[b];
              if (!p || !q) return null;
              const live = a === active || b === active;
              const mx = (p.x + q.x) / 2;
              const d = `M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`;
              const missing = byId(b).missing;
              return (
                <g key={a + b}>
                  <path
                    d={d}
                    fill="none"
                    stroke={live ? "var(--fg)" : "var(--line-2)"}
                    strokeOpacity={live ? 0.55 : 1}
                    strokeWidth={live ? 1.25 : 1}
                    strokeDasharray={missing ? "3 4" : undefined}
                    className="transition-[stroke,stroke-opacity] duration-200 ease-out"
                  />
                  <path
                    ref={(el) => {
                      if (el) pulses.current.set(a + b, el);
                    }}
                    d={d}
                    pathLength={1}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray={`${DASH} 2`}
                    strokeDashoffset={DASH}
                    opacity={0}
                  />
                </g>
              );
            })}
          </svg>

          <div className="relative grid grid-cols-[168px_minmax(0,1fr)_288px] px-4 py-6 lg:grid-cols-[208px_minmax(0,1.25fr)_minmax(0,0.95fr)]">
            <div className="flex flex-col">
              <p className="mb-2 px-2 text-[12px] text-fg-2">Repos</p>
              <div className="flex flex-1 flex-col justify-around">
                {REPOS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    {...nodeProps(n.id)}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className={`block truncate font-mono text-[14px] transition-colors duration-200 ${on(n.id) ? "text-fg" : "text-fg-3"}`}>{n.label}</span>
                      <span className={`flex items-baseline gap-1.5 text-[12px] leading-[1.35] truncate ${n.tone && on(n.id) ? TONE_TEXT[n.tone] : "text-fg-3"}`}>
                        {n.tone ? <span aria-hidden className={`size-1 shrink-0 translate-y-[-2px] rounded-full ${TONE_BG[n.tone]}`} /> : null}
                        <span>{n.meta}</span>
                      </span>
                    </span>
                    <Dot on={on(n.id)} />
                  </button>
                ))}
              </div>
            </div>
            <div aria-hidden />
            <div className="flex flex-col">
                            {THINGS.map((n, i) => {
                const first = i === 0 || THINGS[i - 1].kind !== n.kind;
                return (
                  <div key={n.id} className={first && i > 0 ? "mt-3" : ""}>
                    {first ? <p className={`pl-7 text-[12px] text-fg-2 ${i === 0 ? "mb-1" : "mb-0.5"}`}>{n.kind}</p> : null}
                    <button
                      type="button"
                      {...nodeProps(n.id)}
                      className="flex min-h-8 w-full items-center gap-3 rounded-lg px-2 text-left"
                    >
                      <Dot on={on(n.id)} missing={n.missing} />
                      <span className="flex min-w-0 flex-row items-baseline gap-3">
                        <span className={`shrink-0 truncate font-mono text-[14px] transition-colors duration-200 ${on(n.id) && !n.missing ? "text-fg" : "text-fg-3"}`}>{n.label}</span>
                        <span className={`flex min-w-0 items-center gap-1.5 truncate text-[12px] ${n.tone && on(n.id) ? TONE_TEXT[n.tone] : on(n.id) ? "text-fg-2" : "text-fg-3"}`}>
                          {n.tone ? <span aria-hidden className={`size-1 shrink-0 rounded-full ${TONE_BG[n.tone]}`} /> : null}
                          {n.meta}
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 md:mt-5">
        <p aria-live="polite" className="hidden min-h-14 items-start gap-3 lg:min-h-7 text-[20px] leading-[1.4] text-pretty text-fg md:flex">
          <span aria-hidden className={`mt-3 size-1.5 shrink-0 rounded-full ${tone ? TONE_BG[tone] : "bg-fg"}`} />
          {readout(active)}
        </p>
        <p className="text-[14px] text-pretty text-fg-2 md:mt-2 md:pl-[18px]">A sample. Point at or tap anything.</p>
      </figcaption>
    </figure>
  );
}

function Dot({ on, missing = false }: { on: boolean; missing?: boolean }) {
  return (
    <span
      data-dot
      aria-hidden
      className={`size-2 shrink-0 rounded-full border transition-colors duration-200 ${missing ? "border-dashed border-fg-2 bg-transparent" : on ? "border-fg bg-fg" : "border-fg-3 bg-transparent"}`}
    />
  );
}

function SampleTag({ className = "" }: { className?: string }) {
  return (
    <p className={`shrink-0 text-[12px] whitespace-nowrap text-fg-3 ${className}`}>Sample account</p>
  );
}

const KIND_ONE: Record<Kind, string> = { Hosts: "Host", Domains: "Domain", Actions: "Action", Deploys: "Deploy" };

/**
 * Phones (under 768px): the same web as a stack of repos. Each row carries its status; tapping one
 * opens its ties beneath it on a single wire, with the same amber and red facts and the readout.
 */
function RepoRows({
  open,
  tie,
  onToggle,
  onTie,
  rowRefs,
}: {
  open: string | null;
  tie: string | null;
  onToggle: (id: string) => void;
  onTie: (id: string | null) => void;
  rowRefs: React.RefObject<Map<string, HTMLElement>>;
}) {
  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <p className="text-[12px] text-fg-2">Repos</p>
        <SampleTag />
      </div>
      <ul className="pb-2">
        {REPOS.map((n, i) => {
          const isOpen = open === n.id;
          const ties = touching(n.id).map(([, b]) => byId(b));
          return (
            <li
              key={n.id}
              ref={(el) => {
                if (el) rowRefs.current.set(n.id, el);
              }}
              className={`transition-colors duration-200 ${i > 0 ? "border-t border-line-1" : ""} ${isOpen ? "bg-white/[0.025]" : ""}`}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`ties-${n.id}`}
                onClick={() => onToggle(n.id)}
                className="flex min-h-14 w-full items-start gap-3 px-4 py-2.5 text-left transition-transform duration-100 active:scale-[0.99]"
              >
                <span className="mt-1.5 flex">
                  <Dot on={isOpen} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-mono text-[14px] transition-colors duration-200 ${isOpen ? "text-fg" : "text-fg-2"}`}>{n.label}</span>
                  <span className={`mt-0.5 flex items-center gap-1.5 text-[12px] leading-[1.35] transition-colors duration-200 ${n.tone && isOpen ? TONE_TEXT[n.tone] : "text-fg-3"}`}>
                    {n.tone ? <span aria-hidden className={`size-1 shrink-0 rounded-full ${TONE_BG[n.tone]}`} /> : null}
                    <span className="truncate">{n.meta}</span>
                  </span>
                </span>
                <svg aria-hidden viewBox="0 0 12 12" className={`size-3 shrink-0 self-center text-fg-3 transition-transform duration-200 ease-out ${isOpen ? "rotate-180" : ""}`}>
                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isOpen ? (
                <div id={`ties-${n.id}`} className="ties-in relative pr-4 pb-4 pl-4">
                  <ul className="relative">
                    {/* The wire: from the repo's dot down to its last tie. Its accent run is the pulse. */}
                    <span aria-hidden className="absolute top-[-44px] bottom-[22px] left-[3.5px] w-px bg-line-3" />
                    <span aria-hidden data-run className="absolute top-[-44px] bottom-[22px] left-[3px] w-[2px] origin-top rounded-full bg-accent opacity-0" />
                    {ties.map((t) => {
                      // The same host or deploy under other repos: the shared wire, named.
                      const others = EDGES.filter(([a, b]) => b === t.id && a !== n.id).map(([a]) => byId(a).label);
                      const picked = tie === t.id;
                      return (
                        <li key={t.id} className="relative">
                          <button
                            type="button"
                            aria-pressed={picked}
                            onClick={() => onTie(picked ? null : t.id)}
                            className="grid min-h-11 w-full grid-cols-[8px_56px_minmax(0,1fr)] items-start gap-x-3 py-2 text-left transition-transform duration-100 active:scale-[0.99]"
                          >
                            <span
                              aria-hidden
                              data-tie-dot
                              className={`mt-1.5 size-2 rounded-full border transition-colors duration-200 ${
                                t.missing ? "border-dashed border-fg-2 bg-bg" : picked ? "border-accent bg-accent" : "border-fg bg-fg"
                              }`}
                            />
                            <span className="text-[12px] leading-5 text-fg-3">{KIND_ONE[t.kind!]}</span>
                            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                              <span
                                className={`font-mono text-[14px] leading-5 underline-offset-4 transition-colors duration-200 ${t.missing ? "text-fg-2" : "text-fg"} ${
                                  picked ? "underline decoration-accent" : ""
                                }`}
                              >
                                {t.label}
                              </span>
                              <span className={`inline-flex items-center gap-1.5 text-[12px] leading-5 ${t.tone ? TONE_TEXT[t.tone] : "text-fg-2"}`}>
                                {t.tone ? <span aria-hidden className={`size-1 shrink-0 rounded-full ${TONE_BG[t.tone]}`} /> : null}
                                {t.meta}
                              </span>
                              {others.length ? <span className="text-[12px] leading-5 text-fg-3">also {others.join(", ")}</span> : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p key={tie && ties.some((t) => t.id === tie) ? tie : n.id} className="ties-in mt-3 pl-5 text-[14px] leading-[1.5] text-pretty text-fg-2">
                    {readout(tie && ties.some((t) => t.id === tie) ? tie : n.id)}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
