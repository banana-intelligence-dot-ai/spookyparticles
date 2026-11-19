/**
 * What an AI agent gets from a site: how many bytes it reads for how many words, whether a plain
 * Markdown version answers (Accept: text/markdown), and whether /llms.txt answers. Read-only and
 * on demand: three GETs per site, only to the site's own known hosts, nothing stored.
 */
import { isIP } from "node:net";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pinnedGet, resolvePublic } from "@/lib/net-safety";
import { readNodes } from "@/lib/node-reads";
import { siteTargets } from "@/lib/vercel-monitor";

export type Fetched = { status: number; location?: string; type?: string; body: string; capped: boolean };
export type AgentViewDeps = {
  resolve?: (host: string) => Promise<{ address: string; family: number }[]>;
  get?: (url: URL, address: string, family: number, headers: Record<string, string>, limit: number, timeoutMs: number) => Promise<Fetched>;
};
export type AgentView = {
  project: string;
  url: string | null;
  state: "ok" | "unknown";
  reason: "no_production_site" | "site_protected" | "unreachable" | null;
  page: { bytes: number; words: number; bytesPerWord: number | null; capped: boolean } | null;
  markdown: { served: boolean; bytes: number | null; words: number | null };
  llmsTxt: { served: boolean; bytes: number | null };
  summary: string;
};

const PAGE_LIMIT = 3 * 1024 * 1024;
const MARKDOWN_LIMIT = 1024 * 1024;
const LLMS_LIMIT = 256 * 1024;
const MAX_SITES = 20;
const UA = "SpookyParticles-AgentView/1.0 (+https://spookyparticles.com)";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const countWords = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Text a person sees: no head, scripts, styles, inline SVG, templates or comments; spaces collapsed. */
export function visibleText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head[\s>][\s\S]*?<\/head>/gi, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)[\s>][\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decode(body).replace(/\s+/g, " ").trim();
}

export const visibleWords = (html: string): number => countWords(visibleText(html));

/** Words in a Markdown file, not counting link addresses or code fences' language tags. */
export function markdownWords(md: string): number {
  return countWords(md.replace(/\]\([^)]*\)/g, "] ").replace(/^```\S*/gm, " "));
}

const mediaType = (type?: string) => (type ?? "").split(";")[0].trim().toLowerCase();
const looksHtml = (body: string) => /^\s*(?:<!doctype html|<html|<head|<body)/i.test(body);
export const isMarkdown = (f: Fetched) => f.status === 200 && (mediaType(f.type) === "text/markdown" || mediaType(f.type) === "text/x-markdown") && !looksHtml(f.body);
/** Many sites answer every path with their HTML app shell, so a 200 alone is not an llms.txt. */
export const isLlmsTxt = (f: Fetched) => f.status === 200 && ["text/plain", "text/markdown", "text/x-markdown"].includes(mediaType(f.type)) && !looksHtml(f.body) && f.body.trim().length > 0;

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export function summarize(v: Omit<AgentView, "summary">): string {
  if (v.state === "unknown") {
    if (v.reason === "site_protected") return "The site asks for a login, so an agent gets nothing.";
    if (v.reason === "no_production_site") return "No public site to read yet.";
    return "The site did not answer in time.";
  }
  const p = v.page!;
  const read = `An agent reads ${p.capped ? "over " : ""}${sizeLabel(p.bytes)} to get ${p.words.toLocaleString("en-US")} words.`;
  const md = v.markdown.served ? `Markdown version answers (${sizeLabel(v.markdown.bytes ?? 0)}).` : "No Markdown version.";
  const llms = v.llmsTxt.served ? "llms.txt answers." : "No llms.txt.";
  return `${read} ${md} ${llms}`;
}

/** GET that only follows https to the site's own known hosts, pinned to a public address. */
export async function safeGet(url: URL, knownHosts: Set<string>, headers: Record<string, string>, limit: number, deadline: number, deps: AgentViewDeps): Promise<{ url: URL; page: Fetched } | null> {
  let at = url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const host = at.hostname.toLowerCase().replace(/\.$/, "");
    if (at.protocol !== "https:" || (at.port && at.port !== "443") || at.username || at.password || isIP(host) || !knownHosts.has(host)) return null;
    const left = deadline - Date.now();
    if (left <= 0) return null;
    const addresses = await resolvePublic(host, left, deps.resolve).catch(() => null);
    if (!addresses) return null;
    const get = deps.get ?? ((u, address, family, h, l, t) => pinnedGet(u, { address, family }, t, h, l));
    const page = await get(at, addresses[0].address, addresses[0].family, { "user-agent": UA, ...headers }, limit, deadline - Date.now()).catch(() => null);
    if (!page) return null;
    if (page.status >= 300 && page.status < 400 && page.location) {
      try { at = new URL(page.location, at); } catch { return null; }
      continue;
    }
    const bytes = Buffer.byteLength(page.body);
    return { url: at, page: bytes > limit ? { ...page, body: Buffer.from(page.body).subarray(0, limit).toString("utf8"), capped: true } : page };
  }
  return null;
}

export async function agentViewOf(project: string, startUrl: string | null, knownHosts: Set<string>, deps: AgentViewDeps = {}): Promise<AgentView> {
  const none = { markdown: { served: false, bytes: null, words: null }, llmsTxt: { served: false, bytes: null } };
  const done = (v: Omit<AgentView, "summary">): AgentView => ({ ...v, summary: summarize(v) });
  if (!startUrl) return done({ project, url: null, state: "unknown", reason: "no_production_site", page: null, ...none });
  let start: URL;
  try { start = new URL(startUrl); } catch { return done({ project, url: startUrl, state: "unknown", reason: "no_production_site", page: null, ...none }); }
  const deadline = Date.now() + 10_000;
  const home = await safeGet(start, knownHosts, { accept: "text/html,application/xhtml+xml" }, PAGE_LIMIT, deadline, deps);
  if (!home) return done({ project, url: startUrl, state: "unknown", reason: "unreachable", page: null, ...none });
  if (home.page.status === 401 || home.page.status === 403) return done({ project, url: startUrl, state: "unknown", reason: "site_protected", page: null, ...none });
  if (home.page.status < 200 || home.page.status >= 300) return done({ project, url: startUrl, state: "unknown", reason: "unreachable", page: null, ...none });
  const bytes = Buffer.byteLength(home.page.body);
  const words = visibleWords(home.page.body);
  const [md, llms] = await Promise.all([
    safeGet(home.url, knownHosts, { accept: "text/markdown" }, MARKDOWN_LIMIT, deadline, deps),
    safeGet(new URL("/llms.txt", home.url), knownHosts, { accept: "text/plain, text/markdown" }, LLMS_LIMIT, deadline, deps),
  ]);
  const mdServed = Boolean(md && isMarkdown(md.page));
  const llmsServed = Boolean(llms && isLlmsTxt(llms.page));
  return done({
    project, url: home.url.toString(), state: "ok", reason: null,
    page: { bytes, words, bytesPerWord: words ? Math.round(bytes / words) : null, capped: home.page.capped },
    markdown: { served: mdServed, bytes: mdServed ? Buffer.byteLength(md!.page.body) : null, words: mdServed ? markdownWords(md!.page.body) : null },
    llmsTxt: { served: llmsServed, bytes: llmsServed ? Buffer.byteLength(llms!.page.body) : null },
  });
}

/** Every Vercel project's public site for one account, ten at a time, so twenty sites take about 20 seconds at most. */
export async function agentViewFor(userId: string, deps: AgentViewDeps = {}): Promise<{ checkedAt: string; sites: AgentView[] }> {
  const [projects, domains, links] = await Promise.all([
    readNodes("project", ["production_url"], userId),
    readNodes("domain", ["redirect_to"], userId),
    getDb().select({ fromNodeId: schema.edges.fromNodeId, toNodeId: schema.edges.toNodeId }).from(schema.edges)
      .where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "points_to"))),
  ]);
  const targets = siteTargets(projects, domains, links).sort((a, b) => a.p.name.localeCompare(b.p.name)).slice(0, MAX_SITES);
  const sites: AgentView[] = [];
  for (let i = 0; i < targets.length; i += 10) {
    sites.push(...await Promise.all(targets.slice(i, i + 10).map(({ p, url, knownHosts }) => agentViewOf(p.name, url, knownHosts, deps))));
  }
  return { checkedAt: new Date().toISOString(), sites };
}
