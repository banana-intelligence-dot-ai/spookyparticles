"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The entangled field: repos on the left, what they're tied to on the right. Point at, tap or
 * focus any node and its entangled nodes light up, wherever they live. The panel carries the
 * page's one reactive light (a lamp that follows the pointer with a little mass).
 * A sample: generic project names, no one's data.
 */

type Kind = "Host" | "Domain" | "Database" | "Bill";
type Node = { id: string; label: string; meta: string; kind?: Kind; warn?: boolean };

const REPOS: Node[] = [
  { id: "habit", label: "habit-tracker", meta: "4 days ago" },
  { id: "recipe", label: "recipe-box", meta: "12 days ago" },
  { id: "invoice", label: "invoice-bot", meta: "112 days ago", warn: true },
  { id: "podcast", label: "pdf-to-podcast", meta: "140 days ago", warn: true },
  { id: "waitlist", label: "waitlist-v2", meta: "201 days ago", warn: true },
];

const THINGS: Node[] = [
  { id: "vw", kind: "Host", label: "Vercel", meta: "work login" },
  { id: "vp", kind: "Host", label: "Vercel", meta: "personal login" },
  { id: "rw", kind: "Host", label: "Railway", meta: "personal login" },
  { id: "rn", kind: "Host", label: "Render", meta: "old login" },
  { id: "dh", kind: "Domain", label: "habit.fyi", meta: "renews Mar 2" },
  { id: "di", kind: "Domain", label: "invoice-bot.app", meta: "renews in 9 days", warn: true },
  { id: "ds", kind: "Database", label: "Supabase", meta: "Pro plan, 10 rows", warn: true },
  { id: "bv", kind: "Bill", label: "Vercel Pro", meta: "$40.00/mo, 2 accounts" },
  { id: "br", kind: "Bill", label: "Railway", meta: "$38.40/mo" },
  { id: "bn", kind: "Bill", label: "Render", meta: "$25.00/mo" },
  { id: "bs", kind: "Bill", label: "Supabase Pro", meta: "$25.00/mo" },
];

const EDGES: [string, string][] = [
  ["habit", "vw"],
  ["habit", "dh"],
  ["habit", "bv"],
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
  habit: "Live on Vercel under your work login. habit.fyi renews Mar 2. $20.00/mo.",
  recipe: "On Vercel under your personal login, a second Pro plan. $20.00/mo.",
  invoice: "No push in 112 days, still $38.40/mo on Railway. Its domain renews in 9 days.",
  podcast: "No deploy in 140 days on a login you stopped using. $25.00/mo.",
  waitlist: "A Supabase Pro plan holding 10 rows. $25.00/mo for a waitlist from April.",
};

const tied = (id: string) => new Set(EDGES.filter(([a, b]) => a === id || b === id).flatMap(([a, b]) => [a, b]));

function readout(id: string) {
  if (READOUT[id]) return READOUT[id];
  const t = THINGS.find((n) => n.id === id)!;
  const repos = EDGES.filter(([, b]) => b === id).map(([a]) => REPOS.find((r) => r.id === a)!.label);
  return `${t.label}, ${t.meta}. Tied to ${repos.join(" and ")}.`;
}

type Pt = { x: number; y: number };

export function EntangledField() {
  const [active, setActive] = useState("invoice");
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const [pts, setPts] = useState<Record<string, Pt>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const o = el.getBoundingClientRect();
    const next: Record<string, Pt> = {};
    for (const n of REPOS) {
      const r = refs.current.get(n.id)?.querySelector("[data-dot]")?.getBoundingClientRect();
      if (r) next[n.id] = { x: r.left + r.width / 2 - o.left, y: r.top + r.height / 2 - o.top };
    }
    for (const n of THINGS) {
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
    return () => ro.disconnect();
  }, [measure]);

  // The lamp: lerped toward the pointer (factor 0.15 a frame), fine pointer only, off under Reduce Motion.
  const lamp = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const l = lamp.current;
    if (!el || !l) return;
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const tick = () => {
      x += (tx - x) * 0.15;
      y += (ty - y) * 0.15;
      l.style.transform = `translate(${x}px, ${y}px)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      const o = el.getBoundingClientRect();
      tx = e.clientX - o.left;
      ty = e.clientY - o.top;
      l.style.opacity = "1";
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => (l.style.opacity = "0");
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);

  const lit = tied(active);
  const warnActive = [...REPOS, ...THINGS].find((n) => n.id === active)?.warn;

  const nodeProps = (id: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) refs.current.set(id, el);
    },
    onPointerEnter: () => setActive(id),
    onFocus: () => setActive(id),
    onClick: () => setActive(id),
    "aria-pressed": active === id,
  });

  return (
    <div>
      <div ref={box} className="relative overflow-hidden rounded-2xl border border-line-2 bg-raised shadow-[inset_0_1px_0_var(--highlight)]">
        <div
          ref={lamp}
          aria-hidden
          className="pointer-events-none absolute -top-[280px] -left-[280px] size-[560px] rounded-full opacity-0 transition-opacity duration-200 [background:radial-gradient(closest-side,rgb(255_255_255/0.07),transparent)]"
        />
        <svg aria-hidden className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
          {EDGES.map(([a, b]) => {
            const p = pts[a];
            const q = pts[b];
            if (!p || !q) return null;
            const on = lit.has(a) && lit.has(b) && (a === active || b === active);
            const mx = (p.x + q.x) / 2;
            return (
              <path
                key={a + b}
                d={`M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`}
                fill="none"
                stroke={on ? "var(--fg)" : "var(--line-2)"}
                strokeOpacity={on ? 0.6 : 1}
                strokeWidth={on ? 1.25 : 1}
                className="transition-[stroke,stroke-opacity] duration-200"
              />
            );
          })}
        </svg>

        <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-x-6 px-2 py-4 sm:gap-x-32 sm:px-6 sm:py-6 lg:gap-x-56">
          <div className="flex flex-col">
            <p className="mb-2 px-2 text-[12px] text-fg-3">Repos, last push</p>
            <div className="flex flex-1 flex-col justify-around">
            {REPOS.map((n) => {
              const on = lit.has(n.id) || active === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  {...nodeProps(n.id)}
                  className={`group flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-left transition-opacity duration-200 ${on ? "opacity-100" : "opacity-45 hover:opacity-100"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[12px] text-fg sm:text-[14px]">{n.label}</span>
                    <span className={`block truncate text-[12px] ${n.warn ? "text-amber" : "text-fg-3"}`}>{n.meta}</span>
                  </span>
                  <Dot on={on} />
                </button>
              );
            })}
            </div>
          </div>
          <div className="flex flex-col">
            <p className="mb-2 px-2 pl-7 text-[12px] text-fg-3">Tied to</p>
            {THINGS.map((n, i) => {
              const on = lit.has(n.id) || active === n.id;
              const newGroup = i > 0 && THINGS[i - 1].kind !== n.kind;
              return (
                <button
                  key={n.id}
                  type="button"
                  {...nodeProps(n.id)}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-2 text-left transition-opacity duration-200 sm:min-h-9 ${newGroup ? "mt-2" : ""} ${on ? "opacity-100" : "opacity-45 hover:opacity-100"}`}
                >
                  <Dot on={on} />
                  <span className="min-w-0 sm:flex sm:items-baseline sm:gap-3">
                    <span className="block truncate font-mono text-[12px] text-fg sm:text-[14px]">{n.label}</span>
                    <span className={`block truncate text-[12px] ${n.warn ? "text-amber" : "text-fg-3"}`}>{n.meta}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p aria-live="polite" className="mt-4 flex min-h-12 items-start gap-3 text-[16px] leading-[1.5] text-pretty text-fg sm:text-[20px] sm:leading-[1.4]">
        <span aria-hidden className={`mt-2.5 size-1.5 shrink-0 rounded-full sm:mt-3 ${warnActive ? "bg-amber" : "bg-fg"}`} />
        {readout(active)}
      </p>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      data-dot
      aria-hidden
      className={`size-2 shrink-0 rounded-full border transition-colors duration-200 ${on ? "border-fg bg-fg" : "border-fg-3 bg-transparent"}`}
    />
  );
}
