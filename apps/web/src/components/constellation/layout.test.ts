import { describe, expect, it } from "vitest";
import { brightness, entangled, layoutSky, radius, type ClusterInfo, type Link, type Star } from "./layout";

const NOW = Date.parse("2026-11-02T18:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function star(id: string, over: Partial<Star> = {}): Star {
  return { id, kind: "repo", label: id, hub: false, parent: null, cluster: "a", activityAt: null, monthlyCents: null, status: null, ...over };
}

const stars: Star[] = [
  star("a", { kind: "provider_account", hub: true }),
  star("r1", { parent: "a", activityAt: daysAgo(1) }),
  star("r2", { parent: "a", activityAt: daysAgo(200) }),
  star("d1", { kind: "deployment", parent: "r1", activityAt: daysAgo(1) }),
  star("i", { kind: "inbox", hub: true, cluster: "i" }),
  star("s1", { kind: "subscription", parent: "i", cluster: "i", monthlyCents: 2000 }),
];
const links: Link[] = [
  { from: "a", to: "r1", kind: "owns" },
  { from: "a", to: "r2", kind: "owns" },
  { from: "r1", to: "d1", kind: "deploys" },
  { from: "s1", to: "i", kind: "billed_to" },
  { from: "s1", to: "r1", kind: "pays_for" },
];
const clusters: ClusterInfo[] = [
  { id: "a", label: "octocat", sub: "2 repos · 1 deployment", group: "GitHub" },
  { id: "i", label: "you@example.com", sub: "1 subscription", group: "Inboxes" },
];

describe("brightness", () => {
  it("is full for this week and dim at ninety days or with no activity", () => {
    expect(brightness(daysAgo(2), NOW)).toBe(1);
    expect(brightness(daysAgo(20), NOW)).toBe(0.78);
    expect(brightness(daysAgo(60), NOW)).toBe(0.55);
    expect(brightness(daysAgo(91), NOW)).toBe(0.3);
    expect(brightness(null, NOW)).toBe(0.3);
  });
});

describe("radius", () => {
  it("grows with monthly cost and stays smallest for free things", () => {
    expect(radius({ hub: false, monthlyCents: null }, 1)).toBe(2.6);
    expect(radius({ hub: false, monthlyCents: 2000 }, 1)).toBeGreaterThan(radius({ hub: false, monthlyCents: 500 }, 1));
    expect(radius({ hub: false, monthlyCents: 10_000_000 }, 1)).toBe(2.6 + 6);
  });
});

describe("layoutSky", () => {
  it("is deterministic and places every star", () => {
    const a = layoutSky({ stars, links, clusters, width: 960, now: NOW });
    const b = layoutSky({ stars, links, clusters, width: 960, now: NOW });
    expect(a).toEqual(b);
    expect(a.stars).toHaveLength(stars.length);
    expect(a.links.find((l) => l.kind === "pays_for")?.cross).toBe(true);
    expect(a.links.find((l) => l.kind === "owns")?.cross).toBe(false);
  });

  it("lays fields out in order, with a divider before the second", () => {
    const sky = layoutSky({ stars, links, clusters, width: 960, now: NOW });
    expect(sky.groups.map((g) => g.label)).toEqual(["GitHub", "Inboxes"]);
    expect(sky.groups[0].dividerY).toBeNull();
    expect(sky.groups[1].dividerY).toBeGreaterThan(sky.groups[0].y);
    const hub = (id: string) => sky.stars.find((s) => s.id === id)!;
    expect(hub("i").y).toBeGreaterThan(hub("a").y);
  });

  it("splits the sub line and keeps everything inside a phone-width container", () => {
    const sky = layoutSky({ stars, links, clusters, width: 342, now: NOW });
    expect(sky.clusters[0].subLines).toEqual(["2 repos", "1 deployment"]);
    for (const s of sky.stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(342);
    }
  });
});

describe("entangled", () => {
  it("lights the path to the hub, the children, and cross-cluster links", () => {
    expect([...entangled("r1", stars, links)].sort()).toEqual(["a", "d1", "r1", "s1"]);
  });
  it("lights a whole cluster from its hub, and what it is tied to in other clusters", () => {
    expect(entangled("a", stars, links).has("r2")).toBe(true);
    expect(entangled("i", stars, links).has("r1")).toBe(true);
    expect(entangled("i", stars, links).has("r2")).toBe(false);
  });
});
