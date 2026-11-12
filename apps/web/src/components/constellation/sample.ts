/**
 * An unlabeled sample chart for the landing page and share image: the shape of the
 * product with no names and no amounts, so nothing on a public page pretends to be
 * someone's real data. Deterministic, so the page never reshuffles.
 */
import type { ClusterInfo, Link, Star } from "./layout";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;

export function sampleSky(now: number): { stars: Star[]; links: Link[]; clusters: ClusterInfo[] } {
  const r = rng(1947);
  const stars: Star[] = [];
  const links: Link[] = [];
  const clusters: ClusterInfo[] = [];
  const iso = (days: number) => new Date(now - days * DAY).toISOString();
  const age = () => {
    const x = r();
    return x < 0.3 ? r() * 6 : x < 0.5 ? 7 + r() * 22 : x < 0.68 ? 31 + r() * 58 : 91 + r() * 600;
  };

  const code: [string, number][] = [
    ["a", 14],
    ["b", 46],
    ["c", 9],
  ];
  for (const [id, n] of code) {
    const hub = `hub-${id}`;
    stars.push({ id: hub, kind: "provider_account", label: "", hub: true, parent: null, cluster: hub, activityAt: iso(0), monthlyCents: null, status: null });
    clusters.push({ id: hub, label: "", sub: "", group: "" });
    for (let i = 0; i < n; i++) {
      const rid = `${hub}-r${i}`;
      const d = age();
      stars.push({ id: rid, kind: "repo", label: "", hub: false, parent: hub, cluster: hub, activityAt: iso(d), monthlyCents: null, status: null });
      links.push({ from: hub, to: rid, kind: "owns" });
      if (d < 100 && r() < 0.5) {
        const did = `${rid}-d`;
        const failed = r() < 0.05;
        stars.push({ id: did, kind: "deployment", label: "", hub: false, parent: rid, cluster: hub, activityAt: iso(d + 1), monthlyCents: null, status: failed ? "failure" : "success" });
        links.push({ from: rid, to: did, kind: "deploys" });
      }
    }
  }

  const money: [string, number[]][] = [
    ["m", [2000, 2500, 1000, 3700, 125]],
    ["n", [2000, 2600, 500]],
  ];
  for (const [id, amounts] of money) {
    const hub = `inbox-${id}`;
    stars.push({ id: hub, kind: "inbox", label: "", hub: true, parent: null, cluster: hub, activityAt: iso(0), monthlyCents: null, status: null });
    clusters.push({ id: hub, label: "", sub: "", group: "" });
    amounts.forEach((cents, i) => {
      const sid = `${hub}-s${i}`;
      stars.push({ id: sid, kind: "subscription", label: "", hub: false, parent: hub, cluster: hub, activityAt: iso(r() * 40), monthlyCents: cents, status: null });
      links.push({ from: sid, to: hub, kind: "billed_to" });
    });
  }
  // The point of the product: a bill tied to the project it pays for, across providers.
  links.push({ from: "inbox-m-s0", to: "hub-b-r0", kind: "pays_for" });
  return { stars, links, clusters };
}
