/**
 * The drift chart: the same stars as the star chart, laid out so one thing reads
 * without a legend. Each account and inbox is a lane; across the lane, left is today
 * and right is a year or more ago, and every point sits where it last moved (last push,
 * last deploy, last charge). Points never overlap: a lane grows as tall as its swarm.
 * Pure and deterministic, so a point is where you left it.
 */
import { brightness, radius, type ClusterInfo, type Link, type PlacedLink, type PlacedStar, type Sky, type Star } from "./layout";

const DAY = 86_400_000;
const PAD = 20;
const MAX_DAYS = 1825;

export type DriftTick = { x: number; label: string };
export type DriftLane = {
  id: string;
  label: string;
  sub: string;
  /** Top of the lane and its height, in px. */
  y: number;
  h: number;
  /** Where the label sits: left gutter on wide screens, a line above the lane on narrow ones. */
  labelX: number;
  labelY: number;
  subY: number;
  hubId: string | null;
};
export type DriftSky = Sky & {
  ticks: DriftTick[];
  /** x of the "no activity yet" column, when any point has never moved. */
  neverX: number | null;
  axisY: number;
  plotTop: number;
  plotX0: number;
  plotX1: number;
  lanes: DriftLane[];
  narrow: boolean;
};

const TICKS: { days: number; long: string; short: string }[] = [
  { days: 0, long: "today", short: "today" },
  { days: 7, long: "a week ago", short: "1 wk" },
  { days: 30, long: "a month ago", short: "1 mo" },
  { days: 90, long: "3 months ago", short: "3 mo" },
  { days: 365, long: "a year ago", short: "1 yr" },
  { days: 1095, long: "3 years ago", short: "3 yr" },
];

/** 0 for today, 1 for five years or more: log scale, so this week gets room. */
export function driftReach(activityAt: string | null, now: number): number | null {
  if (!activityAt) return null;
  const d = Math.max(0, (now - Date.parse(activityAt)) / DAY);
  return Math.min(1, Math.log1p(d) / Math.log1p(MAX_DAYS));
}

const truncate = (s: string, chars: number) => (s.length > chars ? `${s.slice(0, Math.max(1, chars - 1))}…` : s);

export function layoutDrift(input: { stars: Star[]; links: Link[]; clusters: ClusterInfo[]; width: number; now: number }): DriftSky {
  const { stars, links, width, now } = input;
  const narrow = width < 640;
  const gutter = narrow ? 0 : 200;
  const plotX0 = PAD + gutter + 8;
  const plotX1 = width - PAD - 8;
  const hasNever = stars.some((s) => !s.hub && !s.activityAt);
  const plotEnd = hasNever ? plotX1 - (narrow ? 36 : 56) : plotX1;
  const neverX = hasNever ? plotX1 - (narrow ? 10 : 18) : null;
  const xOf = (s: Star) => {
    const f = driftReach(s.activityAt, now);
    return f === null ? neverX! : plotX0 + f * (plotEnd - plotX0);
  };
  const ticks: DriftTick[] = TICKS.map((t) => ({
    x: plotX0 + (Math.log1p(t.days) / Math.log1p(MAX_DAYS)) * (plotEnd - plotX0),
    label: narrow ? t.short : t.long,
  }));

  const byId = new Map(stars.map((s) => [s.id, s]));
  const depthOf = (s: Star) => {
    let d = 1;
    let p = s.parent ? byId.get(s.parent) : undefined;
    while (p && !p.hub && d < 4) (d++, (p = p.parent ? byId.get(p.parent) : undefined));
    return d;
  };

  const info = new Map(input.clusters.map((c) => [c.id, c]));
  const order: string[] = input.clusters.map((c) => c.id);
  for (const s of stars) if (!order.includes(s.cluster)) order.push(s.cluster);

  const placedStars: PlacedStar[] = [];
  const lanes: DriftLane[] = [];
  const groups: Sky["groups"] = [];
  const axisY = PAD + 8;
  let y = axisY + 24;
  const plotTop = y;
  let lastGroup: string | null = null;

  for (const id of order) {
    const hub = stars.find((s) => s.hub && s.cluster === id) ?? null;
    const members = stars.filter((s) => !s.hub && s.cluster === id);
    if (!hub && !members.length) continue;
    const c = info.get(id) ?? { id, label: id, sub: "" };
    const group = c.group ?? "";
    if (group !== lastGroup && group) {
      groups.push({ label: group, y: y + 16, dividerY: lastGroup !== null ? y : null });
      y += 28;
    }
    lastGroup = group;

    // Beeswarm: each point at its x, nudged up or down to the nearest free spot.
    const items = members
      .map((s) => {
        const depth = depthOf(s);
        return { s, depth, x: xOf(s), r: radius(s, depth), dy: 0 };
      })
      .sort((a, b) => b.r - a.r || a.x - b.x || a.s.id.localeCompare(b.s.id));
    const placed: typeof items = [];
    for (const it of items) {
      const near = placed.filter((p) => Math.abs(p.x - it.x) < p.r + it.r + 1.5);
      const free = (dy: number) => near.every((p) => Math.hypot(p.x - it.x, p.dy - dy) >= p.r + it.r + 1.5);
      let dy = 0;
      if (!free(0)) {
        const cands = near.flatMap((p) => {
          const need = p.r + it.r + 1.5;
          const dx = p.x - it.x;
          const off = Math.sqrt(Math.max(0, need * need - dx * dx)) + 0.01;
          return [p.dy + off, p.dy - off];
        });
        dy = cands.filter(free).sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
      }
      it.dy = dy;
      placed.push(it);
    }
    const extent = placed.reduce((m, p) => Math.max(m, Math.abs(p.dy) + p.r), 6);

    const labelH = narrow ? 22 : 0;
    const swarmH = Math.max(narrow ? 28 : 44, extent * 2 + 16);
    const h = labelH + swarmH;
    const mid = y + labelH + swarmH / 2;
    const charsLabel = narrow ? Math.floor((width - PAD * 2 - 18) / 7.25) : Math.floor((gutter - 20) / 8.45);
    const charsSub = Math.floor((gutter - 20) / 6.4);
    const lane: DriftLane = {
      id,
      label: truncate(c.label, charsLabel),
      sub: narrow ? "" : truncate(c.sub, charsSub),
      y,
      h,
      labelX: PAD + 16,
      labelY: narrow ? y + 14 : mid - (c.sub ? 3 : -5),
      subY: mid + 15,
      hubId: hub?.id ?? null,
    };
    lanes.push(lane);

    if (hub) {
      placedStars.push({ ...hub, x: PAD + 4, y: narrow ? y + 10 : lane.labelY - 5, r: 4, brightness: 1, depth: 0 });
    }
    for (const p of [...placed].sort((a, b) => a.x - b.x || a.dy - b.dy)) {
      placedStars.push({ ...p.s, x: p.x, y: mid + p.dy, r: p.r, brightness: brightness(p.s.activityAt, now), depth: p.depth });
    }
    y += h;
  }

  const pos = new Map(placedStars.map((s) => [s.id, s]));
  const placedLinks: PlacedLink[] = [];
  for (const l of links) {
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    if (!a || !b) continue;
    const cross = a.cluster !== b.cluster;
    let d: string;
    if (cross) {
      // Between lanes: a soft bow to the right, so it never runs along a lane.
      const mx = Math.max(a.x, b.x) + Math.min(80, Math.abs(b.y - a.y) * 0.35);
      const my = (a.y + b.y) / 2;
      d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    } else {
      d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    placedLinks.push({ ...l, d, cross });
  }

  return {
    width,
    height: Math.max(120, y + PAD),
    stars: placedStars,
    clusters: [],
    groups,
    links: placedLinks,
    ticks,
    neverX,
    axisY,
    plotTop,
    plotX0,
    plotX1,
    lanes,
    narrow,
  };
}
