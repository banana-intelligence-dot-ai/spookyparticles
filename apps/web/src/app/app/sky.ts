/**
 * Turns the API's graph, connections and spend into the constellation's stars and
 * links. Only real records: every point is a node, a connected inbox, or a subscription
 * read from receipts. Edges are the graph's own, plus "billed to" from a subscription
 * to the inbox its receipts arrive in.
 */
import type { ClusterInfo, Link, Star } from "@/components/constellation/layout";
import { formatUsd } from "@/components/use-api";
import type { Connection } from "./connection-model";
import { plural, type Graph, type Spend } from "./data-model";

const KIND_PLURAL: Record<string, [string, string]> = {
  repo: ["repo", "repos"],
  deployment: ["deployment", "deployments"],
  domain: ["domain", "domains"],
  dns_record: ["DNS record", "DNS records"],
  database: ["database", "databases"],
  project: ["project", "projects"],
  service: ["service", "services"],
  api_key: ["key", "keys"],
  subscription: ["subscription", "subscriptions"],
  payment_method: ["card", "cards"],
  invoice: ["invoice", "invoices"],
};

export const kindCount = (kind: string, n: number) => {
  const [one, many] = KIND_PLURAL[kind] ?? [kind, kind];
  return plural(n, one, many);
};

const HUB_KINDS = new Set(["provider_account"]);
/** GitHub deployment states in the words the legend uses. */
const DEPLOY_STATE: Record<string, string> = { success: "live", failure: "failed", error: "failed", inactive: "inactive", pending: "pending", in_progress: "deploying" };
/** Graph kinds never drawn: the user themself. */
const SKIP = new Set(["identity"]);

export const inboxId = (address: string) => `inbox:${address.toLowerCase()}`;

/** What a star stands for, for the readout and its copy button. */
export type StarDetail = {
  copy: string;
  url: string | null;
  source: string | null;
  facts: string[];
};

export type SkyData = { stars: Star[]; links: Link[]; clusters: ClusterInfo[]; details: Map<string, StarDetail> };

export function buildSky(graph: Graph | null, connections: Connection[], spend: Spend | null): SkyData {
  const stars: Star[] = [];
  const links: Link[] = [];
  const details = new Map<string, StarDetail>();
  const nodes = (graph?.nodes ?? []).filter((n) => !SKIP.has(n.kind));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (graph?.edges ?? []).filter((e) => ids.has(e.fromNodeId) && ids.has(e.toNodeId));

  // Hubs: provider accounts from the graph, then each connected inbox.
  const hubs = nodes.filter((n) => HUB_KINDS.has(n.kind));
  const hubIds = new Set(hubs.map((h) => h.id));
  const inboxes = connections.filter((c) => c.provider === "gmail" && c.status !== "revoked");

  // Subscriptions from receipts belong to the inbox their receipts arrive in, not to the
  // repo they pay for: that tie is a cross-cluster arc (pays_for), never a cluster path.
  const inboxIds = new Set(inboxes.map((c) => inboxId(c.display)));
  const subInbox = (n: (typeof nodes)[number]) => {
    const a = typeof n.attributes.inbox === "string" ? inboxId(n.attributes.inbox) : null;
    return n.kind === "subscription" && a && inboxIds.has(a) ? a : null;
  };

  // Undirected walk from each hub that never passes through another hub.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind === "pays_for") continue;
    adj.set(e.fromNodeId, [...(adj.get(e.fromNodeId) ?? []), e.toNodeId]);
    adj.set(e.toNodeId, [...(adj.get(e.toNodeId) ?? []), e.fromNodeId]);
  }
  const cluster = new Map<string, string>();
  const parent = new Map<string, string | null>();
  for (const h of hubs) {
    cluster.set(h.id, h.id);
    parent.set(h.id, null);
  }
  for (const n of nodes) {
    const inbox = subInbox(n);
    if (inbox) (cluster.set(n.id, inbox), parent.set(n.id, inbox));
  }
  for (const h of hubs) {
    const queue = [h.id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (cluster.has(next) || hubIds.has(next)) continue;
        cluster.set(next, h.id);
        parent.set(next, cur);
        queue.push(next);
      }
    }
  }

  const sourceOf = (id: string) => edges.find((e) => e.toNodeId === id || e.fromNodeId === id)?.provenance ?? null;

  for (const n of nodes) {
    const hub = hubIds.has(n.id);
    const url = typeof n.attributes.url === "string" ? n.attributes.url : null;
    const label = n.kind === "deployment" && url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : n.name;
    const attrCents = typeof n.attributes.monthly_cost_cents === "number" ? n.attributes.monthly_cost_cents : null;
    stars.push({
      id: n.id,
      kind: n.kind,
      label,
      hub,
      parent: parent.get(n.id) ?? null,
      cluster: cluster.get(n.id) ?? `kind:${n.kind}`,
      activityAt: n.lastActivityAt,
      monthlyCents: n.monthlyCostCents ?? (n.kind === "subscription" ? attrCents : null),
      status: n.kind === "subscription" ? null : n.status,
    });
    const prov = sourceOf(n.id);
    const facts: string[] = [];
    if (n.kind === "deployment") {
      if (typeof n.attributes.environment === "string") facts.push(n.attributes.environment);
      if (n.status) facts.push(DEPLOY_STATE[n.status] ?? n.status);
    }
    if (n.kind === "repo" && n.attributes.private === true) facts.push("private");
    if (n.status === "archived" || n.status === "suspended") facts.push(n.status);
    const subOf = n.kind === "subscription" && typeof n.attributes.inbox === "string" ? n.attributes.inbox : null;
    if (n.kind === "subscription") {
      facts.push(attrCents !== null ? `${formatUsd(attrCents)}/mo` : "amount unknown");
      if (typeof n.attributes.cadence === "string") facts.push(n.attributes.cadence);
      if (n.status === "lapsed") facts.push("no recent charge");
    }
    const receipts = typeof n.attributes.receipts === "number" ? n.attributes.receipts : null;
    details.set(n.id, {
      copy: n.kind === "deployment" && url ? url : n.name,
      url,
      source: subOf
        ? `${receipts !== null ? `${plural(receipts, "receipt", "receipts")} in ` : "receipts in "}${subOf}`
        : prov
          ? `${prov.source}${prov.call ? `: ${prov.call}` : ""}`
          : null,
      facts,
    });
  }

  for (const e of edges) links.push({ from: e.fromNodeId, to: e.toNodeId, kind: e.kind });

  for (const c of inboxes) {
    const id = inboxId(c.display);
    stars.push({
      id,
      kind: "inbox",
      label: c.display,
      hub: true,
      parent: null,
      cluster: id,
      activityAt: c.lastSyncedAt,
      monthlyCents: null,
      status: c.status === "errored" ? "errored" : null,
    });
    details.set(id, { copy: c.display, url: null, source: "gmail", facts: c.status === "errored" ? ["needs reconnect"] : [] });
  }

  for (const n of nodes) {
    const inbox = subInbox(n);
    if (inbox) links.push({ from: n.id, to: inbox, kind: "billed_to" });
  }

  // Subscriptions from receipts, unless the graph already carries subscription nodes.
  const graphHasSubs = nodes.some((n) => n.kind === "subscription");
  if (spend && !graphHasSubs) {
    for (const s of spend.subscriptions) {
      const hub = inboxId(s.inbox);
      const hasHub = stars.some((x) => x.id === hub);
      const id = `subscription:${s.id}`;
      stars.push({
        id,
        kind: "subscription",
        label: s.plan ? `${s.vendor} ${s.plan}` : s.vendor,
        hub: false,
        parent: hasHub ? hub : null,
        cluster: hasHub ? hub : "kind:subscription",
        activityAt: s.lastBilledAt,
        monthlyCents: s.verified ? s.monthlyCents : null,
        status: s.verified ? null : "unverified",
      });
      if (hasHub) links.push({ from: id, to: hub, kind: "billed_to" });
      const facts = [s.monthlyCents !== null ? `${formatUsd(s.monthlyCents)}/mo` : "amount unknown", s.cadence];
      if (!s.verified) facts.push("sender failed authentication, not counted");
      details.set(id, { copy: s.vendor, url: null, source: `${plural(s.receipts, "receipt", "receipts")} in ${s.inbox}`, facts });
    }
  }

  // Cluster names: the hub's identifier, then what hangs off it.
  const clusters: ClusterInfo[] = [];
  const members = (cid: string) => stars.filter((s) => s.cluster === cid && !s.hub);
  const sub = (cid: string) => {
    const m = members(cid);
    const kinds = new Map<string, number>();
    for (const s of m) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
    const parts = [...kinds.entries()].map(([k, n]) => kindCount(k, n));
    const cents = m.reduce((a, s) => a + (s.monthlyCents ?? 0), 0);
    if (cents > 0) parts.push(`${formatUsd(cents)}/mo`);
    return parts.join(" · ") || "nothing yet";
  };
  for (const h of hubs) clusters.push({ id: h.id, label: h.name, sub: sub(h.id), group: "GitHub" });
  for (const c of inboxes) clusters.push({ id: inboxId(c.display), label: c.display, sub: sub(inboxId(c.display)), group: "Inboxes" });
  const loose = [...new Set(stars.filter((s) => s.cluster.startsWith("kind:")).map((s) => s.cluster))];
  for (const k of loose) {
    const kind = k.slice(5);
    const n = members(k).length;
    clusters.push({
      id: k,
      label: kindCount(kind, n).replace(/^[\d,]+\s/, ""),
      sub: `${n} not linked to an account yet`,
      group: "Not linked",
    });
  }

  return { stars, links, clusters, details };
}
