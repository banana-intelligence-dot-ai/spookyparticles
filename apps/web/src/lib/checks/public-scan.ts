import { isIP } from "node:net";
import { pinnedGet, resolvePublic } from "@/lib/net-safety";

export type ScanHit = { kind: "found"; pattern: string; path: string };
export type ScanResult = { state: "open" | "ok" | "unknown"; reason: "site_protected" | "no_production_site" | "scan_limited" | null; hits: ScanHit[] };
const patterns: [string, RegExp][] = [
  ["Stripe live secret key", /sk_live_[0-9a-zA-Z]{20,}/g], ["Stripe restricted key", /rk_live_[0-9a-zA-Z]{20,}/g],
  ["OpenAI key", /sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}/g], ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{40,}/g],
  ["GitHub token", /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/g],
  ["Slack token", /xox[abprs]-[A-Za-z0-9-]{20,}/g], ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{20,}/g],
  // A bare header appears in many crypto libraries; a real key has key material right after it.
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----(?:\\[nr]|\s)*[A-Za-z0-9+/]{40,}/g],
  ["SendGrid key", /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g],
];
const databaseUrl = /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s"'`/]+:([^@\s"'`]{6,})@([^\s"'`/:?]+)/g;
const PLACEHOLDER_PASSWORD = /^(?:pass(?:word|wd)?\d*|secret|example|changeme|my[-_a-z]*|your[-_a-z]*|x{3,}|\*{3,}|\.{3,})$|[<>{}$%[\]]/i;
const LOCAL_HOST = /^(?:localhost|127\.|0\.0\.0\.0|host(?:name)?$|example\.|db$|database$|postgres$|mysql$|mongo$|redis$)/i;
const jwt = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
export function scanText(text: string, path: string): ScanHit[] {
  const hits: ScanHit[] = [];
  for (const [pattern, re] of patterns) {
    re.lastIndex = 0;
    if (re.test(text)) hits.push({ kind: "found", pattern, path });
  }
  // Connection strings in docs and error messages are common, so placeholders and local hosts do not count.
  for (const match of text.matchAll(databaseUrl)) {
    if (PLACEHOLDER_PASSWORD.test(match[1]) || LOCAL_HOST.test(match[2])) continue;
    hits.push({ kind: "found", pattern: "Database address with password", path });
    break;
  }
  jwt.lastIndex = 0;
  for (const match of text.matchAll(jwt)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split(".")[1], "base64url").toString("utf8"));
      if (payload.role === "service_role") { hits.push({ kind: "found", pattern: "Supabase service role key", path }); break; }
    } catch { /* malformed token */ }
  }
  return hits.slice(0, 10);
}

type Page = { status: number; location?: string; body: string; capped: boolean };
export type ScanDeps = {
  resolve?: (host: string) => Promise<{ address: string; family: number }[]>;
  get?: (url: URL, address: string, family: number, bytes: number, timeoutMs: number) => Promise<Page>;
};
function getPage(url: URL, address: string, family: number, limit: number, timeoutMs: number): Promise<Page> {
  return pinnedGet(url, { address, family }, timeoutMs, { "user-agent": "SpookyParticles-Check/1.0 (+https://spookyparticles.com)" }, limit);
}
const unknown = (reason: "site_protected" | "no_production_site" | "scan_limited"): ScanResult => ({ state: "unknown", reason, hits: [] });
export async function scanPublicSite(startUrl: string | null, knownHosts: Set<string>, deps: ScanDeps = {}): Promise<ScanResult> {
  if (!startUrl) return unknown("no_production_site");
  const deadline = Date.now() + 8000;
  const get = deps.get ?? getPage;
  async function safeGet(url: URL, limit: number): Promise<Page | null> {
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || isIP(host) || !knownHosts.has(host)) return null;
    const left = deadline - Date.now();
    if (left <= 0) return null;
    const addresses = await resolvePublic(host, left, deps.resolve).catch(() => null);
    if (!addresses) return null;
    const page = await get(url, addresses[0].address, addresses[0].family, limit, left);
    const bytes = Buffer.from(page.body);
    return bytes.length > limit ? { ...page, body: bytes.subarray(0, limit).toString("utf8"), capped: true } : page;
  }
  try {
    let url = new URL(startUrl);
    let page: Page | null = null;
    for (let redirects = 0; redirects <= 3; redirects++) {
      page = await safeGet(url, 2 * 1024 * 1024);
      if (!page) return unknown("no_production_site");
      if (page.status >= 300 && page.status < 400 && page.location) {
        if (redirects === 3) return unknown("no_production_site");
        url = new URL(page.location, url);
        continue;
      }
      break;
    }
    if (!page) return unknown("no_production_site");
    if (page.status === 401 || page.status === 403) return unknown("site_protected");
    if (page.status < 200 || page.status >= 300) return unknown("no_production_site");
    const hits = scanText(page.body, url.pathname);
    const srcs = [...page.body.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
    let limited = page.capped || srcs.length > 30;
    let total = 2 * 1024 * 1024;
    for (const src of srcs.slice(0, 30)) {
      if (total >= 20 * 1024 * 1024 || hits.length >= 10) break;
      let script: URL;
      try { script = new URL(src, url); } catch { continue; }
      if (script.origin !== url.origin) continue;
      const limit = Math.min(3 * 1024 * 1024, 20 * 1024 * 1024 - total);
      const body = await safeGet(script, limit).catch(() => null);
      if (!body || body.status < 200 || body.status >= 300) { limited = true; continue; }
      if (body.capped) limited = true;
      total += Buffer.byteLength(body.body);
      hits.push(...scanText(body.body, script.pathname).slice(0, 10 - hits.length));
    }
    return { state: hits.length ? "open" : limited ? "unknown" : "ok", reason: hits.length ? null : limited ? "scan_limited" : null, hits: hits.slice(0, 10) };
  } catch { return unknown("no_production_site"); }
}
