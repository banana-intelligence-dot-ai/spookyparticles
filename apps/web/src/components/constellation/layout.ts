/**
 * The Map's constellation layout. Pure and deterministic: the same inventory always
 * draws the same chart, so a point is where you left it.
 *
 * Each account or inbox is a cluster. Its direct members (repos, subscriptions) sit on
 * a sunflower spiral around it, most recently active nearest the center; their own
 * children (deployments) sit just outside them. Two encodings, both true:
 *   brightness = how recently the thing changed (dormant things are dim),
 *   size       = what it costs per month (free things are the smallest points).
 */

export type Star = {
  id: string;
  /** Graph node kind, or "inbox" for a connected mailbox. */
  kind: string;
  /** The identifier shown and copied: repo full name, URL, inbox address, vendor. */
  label: string;
  /** Account or inbox at the center of a cluster. */
  hub: boolean;
  /** The star this one hangs off inside its cluster. Null for hubs and loose members. */
  parent: string | null;
  /** Hub id, or a virtual group key ("kind:domain") for things attached to no account. */
  cluster: string;
  activityAt: string | null;
  monthlyCents: number | null;
  status: string | null;
};

export type Link = { from: string; to: string; kind: string };

export type ClusterInfo = { id: string; label: string; sub: string; /** Field the cluster belongs to: "GitHub", "Inboxes". */ group?: string };

export type PlacedStar = Star & { x: number; y: number; r: number; brightness: number; depth: number };
export type PlacedCluster = ClusterInfo & {
  cx: number;
  cy: number;
  R: number;
  labelY: number;
  /** The sub line, split onto several lines on narrow screens. */
  subLines: string[];
  labelSize: number;
  subSize: number;
  virtual: boolean;
  /** Age rings around the hub, in px from its center. */
  rings: number[];
};
export type PlacedGroup = { label: string; y: number; dividerY: number | null };
export type PlacedLink = Link & { d: string; cross: boolean };

export type Sky = {
  width: number;
  height: number;
  stars: PlacedStar[];
  clusters: PlacedCluster[];
  groups: PlacedGroup[];
  links: PlacedLink[];
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const DAY = 86_400_000;

/** How bright a point is drawn: recent activity is bright, ninety days or more is dim. */
export function brightness(activityAt: string | null, now: number): number {
  if (!activityAt) return 0.3;
  const days = (now - Date.parse(activityAt)) / DAY;
  if (days <= 7) return 1;
  if (days <= 30) return 0.78;
  if (days <= 90) return 0.55;
  return 0.3;
}

/** Point radius: a hub is a fixed mark; cost grows a point with the square root of dollars. */
export function radius(star: Pick<Star, "hub" | "monthlyCents">, depth: number): number {
  if (star.hub) return 4;
  const base = depth > 1 ? 1.9 : 2.6;
  if (!star.monthlyCents || star.monthlyCents <= 0) return base;
  return base + Math.min(6, Math.sqrt(star.monthlyCents / 100) * 0.9);
}

/** Small stable hash so each cluster's spiral starts at its own angle. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

const byActivity = (a: Star, b: Star) => {
  const ta = a.activityAt ? Date.parse(a.activityAt) : -Infinity;
  const tb = b.activityAt ? Date.parse(b.activityAt) : -Infinity;
  return tb - ta || a.label.localeCompare(b.label);
};

type Local = { star: Star; x: number; y: number; depth: number };

/** Ring marks: distance from the hub is age. Inside the first ring changed this week. */
export const RINGS = [
  { days: 7, at: 0.32, label: "7d" },
  { days: 30, at: 0.56, label: "30d" },
  { days: 90, at: 0.78, label: "90d" },
];

/** 0 at the hub, 1 at the rim: piecewise along the ring marks, then log out to two years. */
export function ageReach(activityAt: string | null, now: number): number {
  if (!activityAt) return 1;
  const d = Math.max(0, (now - Date.parse(activityAt)) / DAY);
  let lo = { days: 0, at: 0 };
  for (const r of RINGS) {
    if (d <= r.days) return lo.at + ((d - lo.days) / (r.days - lo.days)) * (r.at - lo.at);
    lo = r;
  }
  const t = Math.min(1, Math.log(d / 90) / Math.log(730 / 90));
  return 0.78 + t * 0.22;
}

/**
 * One cluster around (0, 0): hub at the center, each member at a distance set by its age
 * (recent near the hub, dormant at the rim) and spread by the golden angle; children sit
 * just outside their parent.
 */
function placeCluster(
  clusterId: string,
  members: Star[],
  children: Map<string, Star[]>,
  hub: Star | null,
  now: number,
): { items: Local[]; R: number; span: number; r0: number } {
  const items: Local[] = [];
  if (hub) items.push({ star: hub, x: 0, y: 0, depth: 0 });
  const hasChildren = members.some((m) => (children.get(m.id)?.length ?? 0) > 0);
  // Big clusters pack tighter, so one large account does not dwarf the rest of the chart.
  const squeeze = members.length > 30 ? Math.pow(30 / members.length, 0.3) : 1;
  const step = (hasChildren ? 13 : 10) * squeeze;
  const r0 = hub ? 14 : 4;
  const turn = hash(clusterId) * Math.PI * 2;
  const sorted = [...members].sort(byActivity);

  const placeChildren = (parent: Star, px: number, py: number, angle: number, depth: number) => {
    const kids = [...(children.get(parent.id) ?? [])].sort(byActivity);
    kids.forEach((k, j) => {
      const a = angle + (j - (kids.length - 1) / 2) * 0.7;
      const d = 7 + Math.floor(j / 5) * 5;
      const x = px + Math.cos(a) * d;
      const y = py + Math.sin(a) * d;
      items.push({ star: k, x, y, depth });
      placeChildren(k, x, y, a, depth + 1);
    });
  };

  const span = Math.max(36, step * Math.sqrt(members.length) * 1.2);
  sorted.forEach((m, i) => {
    const a = turn + i * GOLDEN;
    const r = r0 + span * ageReach(m.activityAt, now);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    items.push({ star: m, x, y, depth: 1 });
    placeChildren(m, x, y, a, 2);
  });

  let R = hub ? 12 : 8;
  for (const it of items) R = Math.max(R, Math.hypot(it.x, it.y) + radius(it.star, it.depth) + 4);
  return { items, R, span, r0 };
}

const CHAR_W = 9.6; // Geist Mono at 16px
const CHAR_W_SMALL = 7.25; // Geist Mono at 12px
const SUB_W = 7.2; // Geist Sans at 14px, average
const SUB_W_SMALL = 6.3; // Geist Sans at 12px
const PAD = 20;
const GROUP_H = 28;

/**
 * Lays the whole sky out for a container `width` px wide. Clusters keep the given order,
 * grouped into fields (GitHub, then inboxes), each field wrapping into centered rows.
 * Wide screens share one scale so sizes compare; narrow screens draw two clusters per row,
 * each scaled to its cell. Text never scales.
 */
export function layoutSky(input: {
  stars: Star[];
  links: Link[];
  clusters: ClusterInfo[];
  width: number;
  now: number;
}): Sky {
  const { stars, links, width, now } = input;
  const byId = new Map(stars.map((s) => [s.id, s]));
  const children = new Map<string, Star[]>();
  for (const s of stars) {
    if (s.parent && byId.has(s.parent)) {
      const list = children.get(s.parent) ?? [];
      list.push(s);
      children.set(s.parent, list);
    }
  }

  const narrow = width < 560;
  const GAP = narrow ? 16 : 40;
  const VGAP = narrow ? 32 : 40;
  const inner = Math.max(120, width - PAD * 2);
  const cell = (inner - GAP) / 2;
  const labelSize = narrow ? 12 : 16;
  const subSize = narrow ? 12 : 14;

  const info = new Map(input.clusters.map((c) => [c.id, c]));
  const order: string[] = [];
  for (const c of input.clusters) order.push(c.id);
  for (const s of stars) if (!order.includes(s.cluster)) order.push(s.cluster);

  const built = order
    .map((id) => {
      const hub = stars.find((s) => s.hub && s.cluster === id) ?? null;
      const members = stars.filter(
        (s) => !s.hub && s.cluster === id && (!s.parent || s.parent === hub?.id || !byId.has(s.parent)),
      );
      if (!hub && !members.length) return null;
      const { items, R, span, r0 } = placeCluster(id, members, children, hub, now);
      const c = info.get(id) ?? { id, label: id, sub: "" };
      const subLines = narrow ? c.sub.split(" · ") : [c.sub];
      const labelW = Math.max(c.label.length * (narrow ? CHAR_W_SMALL : CHAR_W), ...subLines.map((l) => l.length * (narrow ? SUB_W_SMALL : SUB_W)));
      return { id, c, hub, items, R, span, r0, members: members.length, subLines, labelW, group: c.group ?? "" };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const widest = Math.max(1, ...built.map((b) => Math.max(2 * b.R, b.labelW)));
  // Wide screens: grow the chart until the fullest field's row fills the panel (up to 1.8x),
  // so the map reads as the page, not a thumbnail. Never shrink text.
  const fields = [...new Set(built.map((b) => b.group))];
  const rowNeed = Math.max(
    1,
    ...fields.map((g) => {
      const m = built.filter((b) => b.group === g);
      return m.reduce((a, b) => a + 2 * b.R, 0) + GAP * Math.max(0, m.length - 1);
    }),
  );
  const globalScale = Math.min(1.8, inner / widest, Math.max(1, (inner * 0.92) / rowNeed));
  const scaleOf = (b: (typeof built)[number]) => (narrow ? Math.min(1, (cell - 8) / (2 * b.R)) : globalScale);
  const boxOf = (b: (typeof built)[number]) => (narrow ? cell : Math.max(2 * b.R * globalScale, b.labelW));

  const placedStars: PlacedStar[] = [];
  const placedClusters: PlacedCluster[] = [];
  const groups: PlacedGroup[] = [];
  let y = PAD;
  const groupNames = [...new Set(built.map((b) => b.group))];
  const labelled = groupNames.some(Boolean);

  groupNames.forEach((g, gi) => {
    const members = built.filter((b) => b.group === g);
    if (labelled) {
      groups.push({ label: g, y: y + 12, dividerY: gi > 0 ? y - VGAP / 2 : null });
      y += GROUP_H;
    }
    // Rows: greedy wrap at the container width.
    type Row = { items: typeof built; w: number; h: number; lines: number };
    const rows: Row[] = [];
    let row: Row = { items: [], w: 0, h: 0, lines: 1 };
    for (const b of members) {
      const w = boxOf(b);
      if (row.items.length && (narrow ? row.items.length === 2 : row.w + GAP + w > inner)) {
        rows.push(row);
        row = { items: [], w: 0, h: 0, lines: 1 };
      }
      row.w += (row.items.length ? GAP : 0) + w;
      row.h = Math.max(row.h, 2 * b.R * scaleOf(b));
      row.lines = Math.max(row.lines, b.subLines.length);
      row.items.push(b);
    }
    if (row.items.length) rows.push(row);

    for (const r of rows) {
      let x = narrow ? PAD : PAD + (inner - r.w) / 2;
      const midY = y + r.h / 2;
      for (const b of r.items) {
        const w = boxOf(b);
        const sc = scaleOf(b);
        const cx = x + w / 2;
        const R = b.R * sc;
        placedClusters.push({
          ...b.c,
          cx,
          cy: midY,
          R,
          labelY: y + r.h + 24,
          subLines: b.subLines,
          labelSize,
          subSize,
          virtual: !b.hub,
          rings: b.hub && b.members > 1 ? RINGS.map((r) => (b.r0 + b.span * r.at) * sc) : [],
        });
        for (const it of b.items) {
          placedStars.push({
            ...it.star,
            x: cx + it.x * sc,
            y: midY + it.y * sc,
            r: Math.max(1.5, radius(it.star, it.depth) * (sc > 1 ? Math.sqrt(sc) : Math.max(sc, 0.7))),
            brightness: it.star.hub ? 1 : brightness(it.star.activityAt, now),
            depth: it.depth,
          });
        }
        x += w + GAP;
      }
      y += r.h + 30 + r.lines * (narrow ? 16 : 20) + VGAP;
    }
  });

  const pos = new Map(placedStars.map((s) => [s.id, s]));
  const placedLinks: PlacedLink[] = [];
  for (const l of links) {
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    if (!a || !b) continue;
    const cross = a.cluster !== b.cluster;
    let d: string;
    if (cross) {
      // An arc between clusters: lifted by a quarter of its length, so it never hides a cluster.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.25;
      d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    } else {
      d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    placedLinks.push({ ...l, d, cross });
  }

  return {
    width,
    height: Math.max(160, y - VGAP + PAD),
    stars: placedStars,
    clusters: placedClusters,
    groups,
    links: placedLinks,
  };
}

/**
 * Everything entangled with one star: its path to the hub, everything hanging off it,
 * and anything a link ties it to in another cluster.
 */
export function entangled(id: string, stars: Star[], links: Link[]): Set<string> {
  const byId = new Map(stars.map((s) => [s.id, s]));
  const out = new Set<string>([id]);
  let cur = byId.get(id);
  while (cur?.parent && byId.has(cur.parent) && !out.has(cur.parent)) {
    out.add(cur.parent);
    cur = byId.get(cur.parent);
  }
  const start = byId.get(id);
  if (start?.hub) {
    for (const s of stars) if (s.cluster === start.cluster) out.add(s.id);
  } else {
    const queue = [id];
    while (queue.length) {
      const p = queue.shift()!;
      for (const s of stars) if (s.parent === p && !out.has(s.id)) (out.add(s.id), queue.push(s.id));
    }
  }
  // Ties that leave the cluster: from this star, or (for a hub) from anything in it.
  const own = new Set(out);
  const home = byId.get(id)?.cluster;
  const away = (other: string) => byId.get(other)?.cluster !== home;
  for (const l of links) {
    if (own.has(l.from) && !own.has(l.to) && away(l.to)) out.add(l.to);
    if (own.has(l.to) && !own.has(l.from) && away(l.from)) out.add(l.from);
  }
  return out;
}
