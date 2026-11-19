/** Read production sitemaps and check a rotating sample of their pages. */
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pinnedGet, resolvePublic } from "@/lib/net-safety";
import { readNodes } from "@/lib/node-reads";
import { attrs, checkSite, notify, save, siteTargets } from "@/lib/vercel-monitor";

type State = {
  urls: string[];
  checkedAt: string;
  listedAt: string;
  failing: Record<string, number>;
  failingSince: Record<string, string>;
  alertedMissing: string[];
  missingSince: Record<string, string>;
  offset: number;
  readFailures: number;
  unreadableSince: string | null;
};
type Event = { kind: "sitemap_page_dropped" | "sitemap_page_down" | "sitemap_unreadable" | "sitemap_resolved"; key: string; subject: string; text: string; url?: string; silent?: boolean };
type Result = { state: State; events: Event[] };
const SIX_HOURS = 6 * 60 * 60_000;
const BODY_LIMIT = 5 * 1024 * 1024;
const hash = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 16);
const episode = (projectId: string, url: string, at: string, kind: string) => `sitemap:${projectId}:${hash(url)}:${at}:${kind}`;

function safeUrl(raw: string, hosts: Set<string>): URL | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return url.protocol === "https:" && (!url.port || url.port === "443") && !url.username && !url.password && !isIP(host) && hosts.has(host) ? url : null;
  } catch { return null; }
}

const decode = (value: string) => value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
  const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
  try { return String.fromCodePoint(n); } catch { return entity; }
});

/** Small parser for sitemap loc elements, including XML escaped URLs. */
export function sitemapLocs(xml: string): { kind: "index" | "urlset"; urls: string[] } {
  const kind = /<(?:\w+:)?sitemapindex(?:\s|>)/i.test(xml) ? "index" : /<(?:\w+:)?urlset(?:\s|>)/i.test(xml) ? "urlset" : null;
  if (!kind) throw new Error("invalid sitemap");
  return { kind, urls: [...xml.matchAll(/<(?:\w+:)?loc\s*>([\s\S]*?)<\/(?:\w+:)?loc\s*>/gi)].map((m) => decode(m[1].trim())) };
}

async function getXml(start: URL, hosts: Set<string>, deadline: number): Promise<string> {
  let url = start;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (!safeUrl(url.toString(), hosts)) throw new Error("unsafe destination");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("timeout");
    const addresses = await resolvePublic(url.hostname, remaining);
    const answer = await pinnedGet(url, addresses[0], deadline - Date.now(), { "user-agent": "SpookyParticles-Sitemap/1.0 (+https://spookyparticles.com)" }, BODY_LIMIT);
    if (answer.status >= 300 && answer.status < 400 && answer.location) {
      if (redirects === 5) throw new Error("too many redirects");
      url = new URL(answer.location, url);
      continue;
    }
    if (answer.status !== 200 || answer.capped) throw new Error("sitemap unreadable");
    return answer.body;
  }
  throw new Error("too many redirects");
}

/** One deadline covers the index and its children; no response body is retained. */
export async function readSitemap(site: string, hosts: Set<string>): Promise<string[]> {
  const home = safeUrl(site, hosts);
  if (!home) throw new Error("unsafe destination");
  const deadline = Date.now() + 10_000;
  const root = new URL("/sitemap.xml", home);
  const first = sitemapLocs(await getXml(root, hosts, deadline));
  const urls = first.kind === "urlset" ? first.urls : (await Promise.all(first.urls.slice(0, 10).map(async (raw) => {
    const child = safeUrl(raw, hosts);
    if (!child) throw new Error("unsafe child sitemap");
    const parsed = sitemapLocs(await getXml(child, hosts, deadline));
    if (parsed.kind !== "urlset") throw new Error("nested sitemap index");
    return parsed.urls;
  }))).flat();
  return [...new Set(urls.filter((raw) => safeUrl(raw, hosts)).slice(0, 2000))].sort();
}

const priorState = (value: unknown): State | null => {
  if (!value || typeof value !== "object" || !Array.isArray((value as State).urls) || typeof (value as State).checkedAt !== "string") return null;
  const v = value as Partial<State>;
  return { urls: v.urls ?? [], checkedAt: v.checkedAt ?? "", listedAt: v.listedAt ?? v.checkedAt ?? "", failing: v.failing ?? {}, failingSince: v.failingSince ?? {}, alertedMissing: v.alertedMissing ?? [], missingSince: v.missingSince ?? {}, offset: v.offset ?? 0, readFailures: v.readFailures ?? 0, unreadableSince: v.unreadableSince ?? null };
};

export const sitemapDue = (state: { checkedAt: string } | null, nowMs: number) => !state || !Number.isFinite(Date.parse(state.checkedAt)) || nowMs - Date.parse(state.checkedAt) >= SIX_HOURS;

/** Pure state transition with injected reads for deterministic tests. */
export async function checkSitemap(projectId: string, project: string, site: string, hosts: Set<string>, prior: State | null, nowMs: number, read = readSitemap, check = checkSite): Promise<Result> {
  const at = new Date(nowMs).toISOString();
  const state: State = prior ? { ...prior, failing: { ...prior.failing }, failingSince: { ...prior.failingSince }, missingSince: { ...prior.missingSince }, alertedMissing: [...prior.alertedMissing], checkedAt: at } : { urls: [], checkedAt: at, listedAt: at, failing: {}, failingSince: {}, alertedMissing: [], missingSince: {}, offset: 0, readFailures: 0, unreadableSince: null };
  const events: Event[] = [];
  let urls: string[] = [];
  try { urls = [...new Set((await read(site, hosts)).filter((url) => safeUrl(url, hosts)).slice(0, 2000))].sort(); }
  catch { /* An incomplete read must not erase the baseline. */ }
  const bad = !urls.length || Boolean(prior?.urls.length && urls.length * 2 < prior.urls.length);
  if (bad) {
    state.readFailures = Math.min(2, state.readFailures + 1);
    state.unreadableSince ??= at;
    // Only a sitemap that was read before can become unreadable; a site with none is not alerted.
    if (state.readFailures === 2 && (prior?.readFailures ?? 0) < 2 && state.urls.length) {
      const key = episode(projectId, site, state.unreadableSince, "unreadable");
      events.push({ kind: "sitemap_unreadable", key, subject: `${project}: sitemap unreadable`, text: `${project}'s sitemap could not be read twice in a row.` });
    }
  } else {
    if (state.readFailures >= 2 && state.unreadableSince) events.push({ kind: "sitemap_resolved", key: episode(projectId, site, state.unreadableSince, "recovered"), subject: "Sitemap readable", text: "", silent: true });
    state.readFailures = 0;
    state.unreadableSince = null;
    const fresh = new Set(urls);
    if (prior) {
      for (const url of prior.urls) if (!fresh.has(url) && !state.alertedMissing.includes(url)) {
        state.alertedMissing.push(url);
        state.missingSince[url] = prior.listedAt;
        events.push({ kind: "sitemap_page_dropped", key: episode(projectId, url, prior.listedAt, "dropped"), subject: `${project}: page left sitemap`, text: `${url} is missing from ${project}'s sitemap. It was in the sitemap at ${prior.listedAt}.`, url });
      }
      for (const url of state.alertedMissing.filter((u) => fresh.has(u))) {
        events.push({ kind: "sitemap_resolved", key: episode(projectId, url, state.missingSince[url], "recovered"), subject: "Page restored to sitemap", text: "", silent: true });
        state.alertedMissing = state.alertedMissing.filter((u) => u !== url);
        delete state.missingSince[url];
      }
    }
    state.urls = urls;
    state.listedAt = at;
  }
  const sample = Array.from({ length: Math.min(10, state.urls.length) }, (_, i) => state.urls[(state.offset + i) % state.urls.length]);
  state.offset = state.urls.length ? (state.offset + sample.length) % state.urls.length : 0;
  for (const url of sample) {
    const result = await check(url, hosts);
    const count = state.failing[url] ?? 0;
    if (result.kind === "down") {
      if (count === 0 && Object.keys(state.failing).length >= 50) continue;
      state.failingSince[url] ??= at;
      state.failing[url] = count ? 3 : 1;
      if (count === 1) events.push({ kind: "sitemap_page_down", key: episode(projectId, url, state.failingSince[url], "down"), subject: `${project}: sitemap page is down`, text: `${url} answered ${result.status} twice in a row.`, url });
    } else if (count) {
      if (count >= 3) events.push({ kind: "sitemap_resolved", key: episode(projectId, url, state.failingSince[url], "recovered"), subject: "Sitemap page recovered", text: "", silent: true });
      delete state.failing[url];
      delete state.failingSince[url];
    }
  }
  for (const url of Object.keys(state.failing)) if (!state.urls.includes(url)) {
    if (state.failing[url] >= 3) events.push({ kind: "sitemap_resolved", key: episode(projectId, url, state.failingSince[url], "recovered"), subject: "Page no longer in sitemap", text: "", silent: true });
    delete state.failing[url];
    delete state.failingSince[url];
  }
  return { state, events };
}

export async function sweepSitemaps(nowMs = Date.now()): Promise<{ checked: number; alerts: number }> {
  const db = getDb();
  const [projects, domains, links] = await Promise.all([
    readNodes("project", ["production_url", "sitemap"]),
    readNodes("domain", ["redirect_to"]),
    db.select({ fromNodeId: schema.edges.fromNodeId, toNodeId: schema.edges.toNodeId }).from(schema.edges).where(eq(schema.edges.kind, "points_to")),
  ]);
  const candidates = siteTargets(projects, domains, links).filter((x) => x.url && sitemapDue(priorState(attrs(x.p).sitemap), nowMs))
    .sort((a, b) => (priorState(attrs(a.p).sitemap)?.checkedAt ?? "").localeCompare(priorState(attrs(b.p).sitemap)?.checkedAt ?? ""))
    .slice(0, 20);
  let checked = 0, alerts = 0;
  for (let i = 0; i < candidates.length; i += 5) {
    const batch = await Promise.all(candidates.slice(i, i + 5).map(async ({ p, url, knownHosts }) => {
      const result = await checkSitemap(p.id, p.name, url!, knownHosts, priorState(attrs(p).sitemap), nowMs);
      await save(p, "sitemap", result.state);
      let sent = 0;
      for (const event of result.events) if (await notify(p.userId, event.kind, event.key, p.name, event.subject, event.text, event.silent, event.url)) sent++;
      return sent;
    }));
    checked += batch.length;
    alerts += batch.reduce((sum, n) => sum + n, 0);
  }
  return { checked, alerts };
}
