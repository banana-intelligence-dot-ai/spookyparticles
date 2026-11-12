"use client";
/**
 * The constellation: the landing page's one reactive light surface. A lamp follows a fine pointer
 * across the chart and brightens and names the points under it. Pointing at a point
 * lights everything entangled with it, across clusters. Click, tap or Enter pins it and
 * the readout below says what it is and where we observed it.
 *
 * Keyboard: Tab into the chart, arrows move point to point, Up and Down jump between
 * clusters, Escape clears. Touch and Reduce Motion get no lamp; selection still works.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { sampleSky } from "./sample";
import { layoutDrift, type DriftSky } from "./drift";
import { RINGS, entangled, layoutSky, type ClusterInfo, type Link, type PlacedStar, type Sky, type Star } from "./layout";

const LAMP_R = 130;
const LABEL_POOL = 6;
const LABEL_CHAR = 7.25; // Geist Mono at 12px

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const labelBox = (s: PlacedStar, text: string): Box => ({ x: s.x + s.r + 5, y: s.y - 8, w: text.length * LABEL_CHAR + 4, h: 16 });

const isMoney = (s: Star) => (s.monthlyCents ?? 0) > 0;
const isTrouble = (s: Star) => ["errored", "error", "failure", "suspended"].includes(s.status ?? "");
/** A project that needs the user (open finding, failed payment): amber, drift chart only. */
const isAttention = (s: Star) => s.status === "attention";
/** Paint order: plain points first, then money, then amber, then red on top. */
const layer = (s: Star) => (s.hub ? 4 : isTrouble(s) ? 3 : isAttention(s) ? 2 : isMoney(s) ? 1 : 0);

export function Constellation({
  stars,
  links,
  clusters,
  now,
  readout,
  label,
  decorative = false,
  mode = "chart",
}: {
  stars: Star[];
  links: Link[];
  clusters: ClusterInfo[];
  now: number;
  /** Renders the strip under the chart for the selected star, or the legend when null. */
  readout: (star: Star | null, clear: () => void) => ReactNode;
  label: string;
  /** An illustration (the landing page): no focus stop, hidden from assistive tech. */
  decorative?: boolean;
  /** "chart": clusters around hubs (the landing). "drift": one lane per account, left is today. */
  mode?: "chart" | "drift";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lampRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusVisible, setFocusVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const sky = useMemo<Sky | DriftSky | null>(
    () => (width ? (mode === "drift" ? layoutDrift : layoutSky)({ stars, links, clusters, width, now }) : null),
    [stars, links, clusters, width, now, mode],
  );
  const drift = sky && "lanes" in sky ? sky : null;
  const order = useMemo(() => sky?.stars.map((s) => s.id) ?? [], [sky]);
  const byId = useMemo(() => new Map(sky?.stars.map((s) => [s.id, s]) ?? []), [sky]);

  const active = hover ?? selected;
  const hubIds = useMemo(() => new Set(stars.filter((s) => s.hub).map((s) => s.id)), [stars]);
  // The largest cluster carries the ring labels, once for the whole chart.
  const activeCluster = active ? (stars.find((s) => s.id === active)?.cluster ?? null) : null;
  const ringKey = useMemo(() => {
    if (!sky) return null;
    const own = activeCluster ? sky.clusters.find((c) => c.id === activeCluster && c.rings.length) : null;
    return own ?? [...sky.clusters].filter((c) => c.rings.length).sort((a, b) => b.R - a.R)[0] ?? null;
  }, [sky, activeCluster]);
  const lit = useMemo(() => (active ? entangled(active, stars, links) : null), [active, stars, links]);

  // Labels React owns: the lit set, nearest first, skipping any that would collide.
  // Drift at rest names what matters: every red and amber point, then the costliest bills.
  const fixedLabels = useMemo(() => {
    if (sky && drift && !lit) {
      const money = sky.stars.filter((s) => !s.hub && isMoney(s) && !isTrouble(s)).sort((a, b) => (b.monthlyCents ?? 0) - (a.monthlyCents ?? 0)).slice(0, 3);
      const loud = sky.stars.filter((s) => !s.hub && (isTrouble(s) || isAttention(s)));
      const placed: { s: PlacedStar; box: Box; rest?: boolean }[] = [];
      const lanes: Box[] = drift.narrow ? [] : drift.lanes.map((l) => ({ x: 0, y: l.y, w: drift.plotX0 - 12, h: l.h }));
      for (const s of [...loud, ...money]) {
        const short = s.label.includes("/") ? s.label.split("/").pop()! : s.label;
        const w = short.length * LABEL_CHAR + 4;
        const spots: Box[] = [
          { x: s.x + s.r + 6, y: s.y - 8, w, h: 16 },
          { x: s.x - s.r - 6 - w, y: s.y - 8, w, h: 16 },
          { x: s.x - w / 2, y: s.y - s.r - 20, w, h: 16 },
          { x: s.x - w / 2, y: s.y + s.r + 4, w, h: 16 },
        ];
        const fits = (box: Box) =>
          box.x > (drift.narrow ? 4 : drift.plotX0 - 12) &&
          box.x + box.w < sky.width - 8 &&
          !sky.stars.some((o) => o.id !== s.id && o.x + o.r > box.x && o.x - o.r < box.x + box.w && o.y + o.r > box.y && o.y - o.r < box.y + box.h) &&
          !placed.some((p) => overlaps(p.box, box)) &&
          !lanes.some((b) => overlaps(b, box));
        const box = spots.find(fits);
        if (!box) continue;
        placed.push({ s: { ...s, label: short }, box, rest: true });
      }
      return placed;
    }
    if (!sky || !lit || !active) return [];
    const origin = byId.get(active);
    if (!origin) return [];
    const boxes: Box[] = sky.clusters.map((c) => ({ x: c.cx - 60, y: c.labelY - 14, w: 120, h: 34 }));
    const picked: { s: PlacedStar; box: Box; rest?: boolean }[] = [];
    const candidates = [...lit]
      .map((id) => byId.get(id))
      .filter((s): s is PlacedStar => Boolean(s) && !s!.hub)
      .sort((a, b) => (a.id === active ? -1 : b.id === active ? 1 : Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y)));
    for (const s of candidates) {
      const box = labelBox(s, s.label);
      if (drift) (box.x = s.x - box.w / 2), (box.y = s.y - s.r - 24);
      if (box.x + box.w > sky.width) box.x = drift ? sky.width - box.w - 8 : s.x - s.r - 5 - box.w;
      if (s.id !== active && (picked.some((p) => overlaps(p.box, box)) || boxes.some((b) => overlaps(b, box)))) continue;
      picked.push({ s, box });
      if (picked.length >= 10) break;
    }
    return picked;
  }, [sky, lit, active, byId]);

  // The lamp reads the current labels through a ref, so hovering never restarts it.
  const fixedRef = useRef(fixedLabels);
  fixedRef.current = fixedLabels;
  const paintRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    paintRef.current?.();
  }, [fixedLabels]);

  // The lamp: lerped pointer light plus per-point brightening and a small pool of labels.
  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    const lamp = lampRef.current;
    if (!wrap || !svg || !lamp || !sky) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const circles = new Map<string, SVGElement>();
    svg.querySelectorAll<SVGElement>("[data-star]").forEach((el) => circles.set(el.dataset.star!, el));
    const pool = [...svg.querySelectorAll<SVGTextElement>("[data-pool]")];
    const prev = new Map<string, number>();

    let raf = 0;
    let inside = false;
    const target = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };

    const paint = () => {
      const fixedLabels = fixedRef.current;
      const fixed = new Set(fixedLabels.filter((p) => !p.rest).map((p) => p.s.id));
      lamp.style.setProperty("--mx", `${pos.x.toFixed(1)}px`);
      lamp.style.setProperty("--my", `${pos.y.toFixed(1)}px`);
      const near: { s: PlacedStar; d: number }[] = [];
      for (const s of sky.stars) {
        const d = inside ? Math.hypot(s.x - pos.x, s.y - pos.y) : Infinity;
        const k = d < LAMP_R ? 1 - d / LAMP_R : 0;
        if (Math.abs((prev.get(s.id) ?? 0) - k) > 0.02 || (k === 0 && prev.get(s.id))) {
          circles.get(s.id)?.style.setProperty("--k", k.toFixed(2));
          prev.set(s.id, k);
        }
        if (k > 0.25 && !s.hub && !fixed.has(s.id) && !fixed.size) near.push({ s, d });
      }
      near.sort((a, b) => a.d - b.d);
      const boxes: Box[] = [
        ...fixedLabels.map((p) => p.box),
        ...sky.clusters.map((c) => ({ x: c.cx - 60, y: c.labelY - 14, w: 120, h: 34 })),
      ];
      let used = 0;
      for (const { s } of near) {
        if (used >= LABEL_POOL) break;
        const box = labelBox(s, s.label);
        if (box.x + box.w > sky.width) box.x = s.x - s.r - 5 - box.w;
        if (boxes.some((b) => overlaps(b, box))) continue;
        boxes.push(box);
        const t = pool[used++];
        t.textContent = s.label;
        t.setAttribute("x", (box.x + 2).toFixed(1));
        t.setAttribute("y", (s.y + 4).toFixed(1));
        t.style.opacity = "1";
      }
      for (let i = used; i < pool.length; i++) pool[i].style.opacity = "0";
    };

    const tick = () => {
      pos.x += (target.x - pos.x) * 0.15;
      pos.y += (target.y - pos.y) * 0.15;
      paint();
      raf = Math.abs(target.x - pos.x) > 0.5 || Math.abs(target.y - pos.y) > 0.5 ? requestAnimationFrame(tick) : 0;
    };

    const local = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      // Hover target: the nearest point within reach of the pointer.
      let best: PlacedStar | null = null;
      let bestD = 14;
      for (const s of sky.stars) {
        const d = Math.hypot(s.x - p.x, s.y - p.y) - s.r;
        if (d < bestD) (best = s), (bestD = d);
      }
      setHover(best?.id ?? null);
      if (!fine || calm) return;
      target.x = p.x;
      target.y = p.y;
      if (!inside) {
        pos.x = p.x;
        pos.y = p.y;
        inside = true;
        wrap.style.setProperty("--light", "1");
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      setHover(null);
      inside = false;
      wrap.style.setProperty("--light", "0");
      cancelAnimationFrame(raf);
      raf = 0;
      paint();
    };

    paintRef.current = paint;
    paint();
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerleave", onLeave);
    return () => {
      paintRef.current = null;
      cancelAnimationFrame(raf);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerleave", onLeave);
    };
  }, [sky]);

  const clear = useCallback(() => {
    setSelected(null);
    setHover(null);
  }, []);

  const pick = (id: string | null) => {
    setSelected((cur) => (cur === id ? null : id));
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!sky || !order.length) return;
    const cur = focusId ?? order[0];
    const i = Math.max(0, order.indexOf(cur));
    const clusterStart = (dir: 1 | -1) => {
      const c = byId.get(cur)?.cluster;
      const ids = drift ? drift.lanes.map((l) => l.id) : sky.clusters.map((cl) => cl.id);
      const starts = ids.map((cid) => sky.stars.find((s) => s.cluster === cid)?.id).filter((x): x is string => Boolean(x));
      const at = starts.findIndex((id) => byId.get(id)?.cluster === c);
      return starts[Math.min(starts.length - 1, Math.max(0, at + dir))];
    };
    let next: string | null = null;
    if (e.key === "ArrowRight") next = order[Math.min(order.length - 1, i + 1)];
    else if (e.key === "ArrowLeft") next = order[Math.max(0, i - 1)];
    else if (e.key === "ArrowDown") next = clusterStart(1);
    else if (e.key === "ArrowUp") next = clusterStart(-1);
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[order.length - 1];
    else if (e.key === "Escape") {
      clear();
      return;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cur);
      return;
    }
    if (next) {
      e.preventDefault();
      setFocusId(next);
      setFocusVisible(true);
      setSelected(next);
    }
  };

  const focused = focusVisible && focusId ? byId.get(focusId) : null;
  const selStar = selected ? (stars.find((s) => s.id === selected) ?? null) : null;

  return (
    <div>
      <div ref={wrapRef} className="relative overflow-hidden">
        <span
          ref={lampRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out"
          style={{
            opacity: "var(--light, 0)",
            background: `radial-gradient(${LAMP_R * 2.4}px circle at var(--mx, -999px) var(--my, -999px), var(--lamp), transparent 70%)`,
          }}
        />
        {sky ? (
          <svg
            ref={svgRef}
            width={sky.width}
            height={sky.height}
            viewBox={`0 0 ${sky.width} ${sky.height}`}
            className="relative block touch-manipulation select-none outline-none"
            role={decorative ? undefined : "group"}
            aria-label={decorative ? undefined : label}
            aria-hidden={decorative || undefined}
            tabIndex={decorative ? undefined : 0}
            onKeyDown={onKey}
            onFocus={() => {
              if (!focusId) setFocusId(order[0] ?? null);
            }}
            onKeyUp={() => setFocusVisible(true)}
            onBlur={() => setFocusVisible(false)}
            onClick={(e) => {
              const r = svgRef.current!.getBoundingClientRect();
              const x = e.clientX - r.left;
              const y = e.clientY - r.top;
              let best: PlacedStar | null = null;
              let bestD = 18;
              for (const s of sky.stars) {
                const d = Math.hypot(s.x - x, s.y - y) - s.r;
                if (d < bestD) (best = s), (bestD = d);
              }
              setFocusVisible(false);
              if (best) setFocusId(best.id);
              pick(best?.id ?? null);
            }}
          >
            {drift ? <DriftFrame sky={drift} /> : null}
            <g fill="none" stroke="var(--fg)" strokeOpacity="0.12" strokeDasharray="2 4">
              {sky.clusters.map((c) =>
                c.rings.map((r, i) => <circle key={`${c.id}-${i}`} cx={c.cx} cy={c.cy} r={r} />),
              )}
            </g>
            <g fill="none" strokeWidth="1">
              {sky.links.map((l, i) => {
                const on = lit ? lit.has(l.from) && lit.has(l.to) : false;
                // Drift: the lane is the tie to its account, so hub spokes never draw.
                if (drift && (hubIds.has(l.from) || hubIds.has(l.to))) return null;
                if (drift && !on && !l.cross) return null;
                // Hub spokes draw only when lit; at rest the rings carry the structure.
                if (!on && hubIds.has(l.from) !== hubIds.has(l.to) && (hubIds.has(l.from) || hubIds.has(l.to))) return null;
                return (
                  <path
                    key={i}
                    d={l.d}
                    stroke="var(--fg)"
                    strokeOpacity={lit ? (on ? 0.42 : 0.03) : l.cross ? (drift ? 0.09 : 0.2) : 0.085}
                    className="transition-[stroke-opacity] duration-150 ease-out"
                  />
                );
              })}
            </g>

            <g>
              {(drift ? [...sky.stars].sort((a, b) => layer(a) - layer(b)) : sky.stars).map((s) => {
                // The lit set at full strength, its own cluster half lit, everything else faint.
                const dim = lit ? (lit.has(s.id) ? 1 : s.cluster === activeCluster ? 0.5 : drift ? 0.32 : 0.2) : 1;
                const base = (lit && lit.has(s.id) ? 1 : s.brightness) * dim;
                const money = isMoney(s);
                // Money is ink, never green: a bill is a hollow ring sized by cost.
                const color = "var(--fg)";
                // Drift: plain points stay below full ink so red and amber carry the signal.
                const cap = drift && !money && !isTrouble(s) && !isAttention(s) && !(lit && lit.has(s.id)) ? 0.7 : 1;
                const style = { "--b": ((isTrouble(s) && !s.hub && !(drift && lit) ? Math.max(base, dim) : base) * cap).toFixed(2), opacity: "min(1, calc(var(--b) + var(--k, 0) * 0.6))" } as React.CSSProperties;
                if (drift && s.hub) {
                  return (
                    <circle key={s.id} data-star={s.id} cx={s.x} cy={s.y} r={3} fill={isTrouble(s) ? "var(--amber)" : "var(--fg-3)"} style={style} className="transition-opacity duration-150 ease-out" />
                  );
                }
                if (drift && isAttention(s)) {
                  return (
                    <g key={s.id} data-star={s.id} style={{ ...style, "--b": lit && !lit.has(s.id) ? String(dim) : "1" } as React.CSSProperties}>
                      <circle cx={s.x} cy={s.y} r={s.r * 1.5 + 3} fill="none" stroke="var(--amber)" strokeWidth="1" />
                      <circle cx={s.x} cy={s.y} r={s.r * 1.2} fill="var(--amber)" />
                    </g>
                  );
                }
                if (drift && isTrouble(s)) {
                  return (
                    <g key={s.id} data-star={s.id} style={{ ...style, "--b": lit && !lit.has(s.id) ? String(dim) : "1" } as React.CSSProperties}>
                      <circle cx={s.x} cy={s.y} r={s.r * 1.5 + 3} fill="none" stroke="var(--red)" strokeWidth="1" />
                      <circle cx={s.x} cy={s.y} r={s.r * 1.3} fill="var(--red)" />
                    </g>
                  );
                }
                if (drift && s.kind === "subscription" && !money && !isTrouble(s)) {
                  return (
                    <circle key={s.id} data-star={s.id} cx={s.x} cy={s.y} r={Math.max(2, s.r - 0.5)} fill="none" stroke="var(--fg-2)" strokeWidth="1.2" strokeDasharray="2 2" style={style} className="transition-opacity duration-150 ease-out" />
                  );
                }
                return s.hub ? (
                  <g key={s.id} data-star={s.id} style={style} className="transition-opacity duration-150 ease-out">
                    <circle cx={s.x} cy={s.y} r={s.r + 1.5} fill="none" stroke={isTrouble(s) ? "var(--amber)" : color} strokeWidth="1.25" />
                    <circle cx={s.x} cy={s.y} r={1.4} fill={isTrouble(s) ? "var(--amber)" : color} />
                  </g>
                ) : (
                  isTrouble(s) ? (
                    <g key={s.id} data-star={s.id} style={{ ...style, "--b": "1" } as React.CSSProperties}>
                      <circle cx={s.x} cy={s.y} r={s.r + 3} fill="none" stroke="var(--red)" strokeWidth="1" />
                      <circle cx={s.x} cy={s.y} r={s.r + 0.5} fill="var(--red)" />
                    </g>
                  ) : money ? (
                    <circle key={s.id} data-star={s.id} cx={s.x} cy={s.y} r={Math.max(2.5, s.r)} fill="none" stroke="var(--fg)" strokeWidth="1.4" style={style} className="transition-opacity duration-150 ease-out" />
                  ) : (
                    <circle
                      key={s.id}
                      data-star={s.id}
                      cx={s.x}
                      cy={s.y}
                      r={s.r}
                      fill={color}
                      style={style}
                      className="transition-opacity duration-150 ease-out"
                    />
                  )
                );
              })}
            </g>

            {ringKey ? (
              <g fontSize="12" fill="var(--fg-2)" className="font-mono">
                {ringKey.rings.map((r, i) => {
                  // Skip a label that would crowd the next ring's; the outermost always shows.
                  const next = ringKey.rings[i + 1];
                  if (next !== undefined && (next - r) * 0.94 < RINGS[i].label.length * 7.25 + 10) return null;
                  const x = ringKey.cx + r * 0.94;
                  const y = ringKey.cy - r * 0.342;
                  const w = RINGS[i].label.length * 7.25 + 6;
                  return (
                    <g key={i}>
                      <text x={x} y={y}>
                        {RINGS[i].label}
                      </text>
                    </g>
                  );
                })}
              </g>
            ) : null}
            {selected && byId.get(selected) ? (
              <circle
                cx={byId.get(selected)!.x}
                cy={byId.get(selected)!.y}
                r={byId.get(selected)!.r + (drift ? 5 : 4)}
                fill="none"
                stroke="var(--fg)"
                strokeOpacity={drift ? 1 : 0.6}
                strokeWidth={drift ? 2 : 1}
              />
            ) : null}
            {focused ? (
              <circle cx={focused.x} cy={focused.y} r={focused.r + 6} fill="none" stroke="var(--accent)" strokeWidth="2" />
            ) : null}

            <g className="font-mono" fontSize="12">
              {fixedLabels.map(({ s, box, rest }) =>
                rest ? (
                  <text key={s.id} x={box.x + 2} y={box.y + 12} fill={isTrouble(s) ? "var(--red)" : isAttention(s) ? "var(--amber)" : "var(--fg-2)"}>
                    {s.label}
                  </text>
                ) : (
                <g key={s.id}>
                  <rect
                    x={box.x - 4}
                    y={box.y - 1}
                    width={box.w + 4}
                    height={box.h + 2}
                    rx={9}
                    fill="var(--fg)"
                    fillOpacity="0.07"
                    stroke="var(--line-2)"
                  />
                  <text x={box.x + 2} y={box.y + 12} fill="var(--fg)">
                    {s.label}
                  </text>
                </g>
                ),
              )}
              {Array.from({ length: LABEL_POOL }, (_, i) => (
                <text key={`pool-${i}`} data-pool="" fill="var(--fg-2)" style={{ opacity: 0 }} className="transition-opacity duration-150" />
              ))}
            </g>

            <g>
              {sky.groups.map((g) => (
                <g key={g.label}>
                  {g.dividerY !== null ? <line x1={0} x2={sky.width} y1={g.dividerY} y2={g.dividerY} stroke="var(--line-1)" /> : null}
                  <text x={20} y={g.y} fontSize="12" fill="var(--fg-2)">
                    {g.label}
                  </text>
                </g>
              ))}
              {sky.clusters.map((c) => (
                <g key={c.id} style={{ opacity: lit && !sky.stars.some((s) => s.cluster === c.id && lit.has(s.id)) ? 0.6 : 1 }}>
                  <text x={c.cx} y={c.labelY} textAnchor="middle" fontSize={c.labelSize} fill="var(--fg)" className="font-mono">
                    {c.label}
                  </text>
                  {c.subLines.map((line, i) => (
                    <text key={i} x={c.cx} y={c.labelY + (c.subSize + 6) + i * 16} textAnchor="middle" fontSize={c.subSize} fill="var(--fg-2)">
                      {line}
                    </text>
                  ))}
                </g>
              ))}
            </g>
          </svg>
        ) : (
          <div style={{ height: 320 }} />
        )}
      </div>
      <div aria-live="polite">{readout(selStar, clear)}</div>
    </div>
  );
}

/** The drift chart's frame: the time axis across the top, its guides, and each lane's name. */
function DriftFrame({ sky }: { sky: DriftSky }) {
  const bottom = sky.height - 20;
  return (
    <g>
      <g stroke="var(--fg)" strokeOpacity="0.07" strokeDasharray="2 4">
        {sky.ticks.map((t) => (
          <line key={t.label} x1={t.x} x2={t.x} y1={sky.plotTop - 6} y2={bottom} />
        ))}
        {sky.neverX !== null ? <line x1={sky.neverX} x2={sky.neverX} y1={sky.plotTop - 6} y2={bottom} /> : null}
      </g>
      <g fontSize="12" fill="var(--fg-2)">
        {sky.ticks.map((t, i) => (
          <text key={t.label} x={t.x} y={sky.axisY + 8} textAnchor={i === 0 ? "start" : "middle"}>
            {t.label}
          </text>
        ))}
        {sky.neverX !== null ? (
          <text x={sky.neverX} y={sky.axisY + 8} textAnchor="middle" fill="var(--fg-3)">
            {sky.narrow ? "never" : "no activity"}
          </text>
        ) : null}
        {!sky.narrow ? (
          <text x={20} y={sky.axisY + 8} fill="var(--fg-3)">
            Last moved
          </text>
        ) : null}
      </g>
      <g>
        {sky.lanes.map((l, i) => (
          <g key={l.id}>
            {i > 0 && !sky.groups.some((g) => g.dividerY !== null && Math.abs(g.dividerY - l.y) < 1) ? (
              <line x1={20} x2={sky.width - 20} y1={l.y} y2={l.y} stroke="var(--fg)" strokeOpacity="0.05" />
            ) : null}
            <text x={l.labelX} y={l.labelY} fontSize={sky.narrow ? 12 : 14} fill="var(--fg)" className="font-mono">
              {l.label}
            </text>
            {l.sub ? (
              <text x={l.labelX} y={l.subY} fontSize="12" fill="var(--fg-2)">
                {l.sub}
              </text>
            ) : null}
          </g>
        ))}
      </g>
    </g>
  );
}

/** Fixed clock: the sample's ages are relative to it, so the chart never changes between visits. */
const SAMPLE_NOW = Date.parse("2026-11-01T12:00:00Z");

/** The landing page's chart: the real component on an unlabeled sample (no names, no amounts). */
export function SampleChart() {
  const sky = useMemo(() => sampleSky(SAMPLE_NOW), []);
  return (
    <Constellation
      stars={sky.stars}
      links={sky.links}
      clusters={sky.clusters}
      now={SAMPLE_NOW}
      label="Sample chart"
      decorative
      readout={() => null}
    />
  );
}
