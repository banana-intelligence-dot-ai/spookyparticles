import { isIP } from "node:net";
import { and, count, eq, isNotNull, ne, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { recordPingById } from "@/lib/checkins";
import { pinnedGet, resolvePublic } from "@/lib/net-safety";
import { expectedRuns, validSchedule, validTimeZone } from "@/lib/vercel-schedules";

export type ExpectRule = { path: string; op: "eq" | "gte" | "lte" | "gt" | "lt" | "exists"; value?: string | number | boolean };
/** A page check reads HTML: links whose text contains `text` must all start with `hrefStartsWith`, and every link to a host in `answer` must reply. */
export type PageRules = { links?: { text: string; hrefStartsWith: string }[]; answer?: string[] };
export type Probe = { url: string; expect: ExpectRule[] } | { url: string; page: PageRules };

const MAX_PAGE_LINK_RULES = 5;
const MAX_ANSWER_HOSTS = 10;
/** Links checked per page run, so one page cannot make Spooky a traffic source. */
export const MAX_ANSWER_LINKS = 12;
const HOST = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function validatePage(raw: unknown): PageRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((k) => !["links", "answer"].includes(k))) throw new Error("probe.page: links or answer required");
  const p = raw as Record<string, unknown>;
  const out: PageRules = {};
  if (p.links !== undefined) {
    if (!Array.isArray(p.links) || p.links.length < 1 || p.links.length > MAX_PAGE_LINK_RULES) throw new Error(`probe.page.links: 1 to ${MAX_PAGE_LINK_RULES} rules required`);
    out.links = p.links.map((rule) => {
      if (!rule || typeof rule !== "object" || Array.isArray(rule) || Object.keys(rule).some((k) => !["text", "hrefStartsWith"].includes(k))) throw new Error("probe.page.links: text and hrefStartsWith required");
      const r = rule as Record<string, unknown>;
      if (typeof r.text !== "string" || !r.text.trim() || r.text.length > 80) throw new Error("probe.page.links: text of 1 to 80 characters required");
      if (typeof r.hrefStartsWith !== "string" || r.hrefStartsWith.length > 300 || !/^(?:https:\/\/|mailto:|\/)/.test(r.hrefStartsWith)) throw new Error("probe.page.links: hrefStartsWith must start with https://, mailto: or /");
      return { text: r.text.trim(), hrefStartsWith: r.hrefStartsWith };
    });
  }
  if (p.answer !== undefined) {
    if (!Array.isArray(p.answer) || p.answer.length < 1 || p.answer.length > MAX_ANSWER_HOSTS) throw new Error(`probe.page.answer: 1 to ${MAX_ANSWER_HOSTS} hosts required`);
    out.answer = p.answer.map((host) => {
      if (typeof host !== "string" || !HOST.test(host.toLowerCase())) throw new Error("probe.page.answer: host names required, like example.com");
      return host.toLowerCase();
    });
  }
  if (!out.links && !out.answer) throw new Error("probe.page: links or answer required");
  return out;
}

export function validateOutcomeInput(schedule: unknown, timeZone: unknown, probe: unknown): { schedule: string | null; timeZone: string | null; probe: Probe | null } {
  if (schedule !== null && schedule !== undefined && (typeof schedule !== "string" || !validSchedule(schedule))) throw new Error("schedule: valid 5-field cron required");
  if (timeZone !== null && timeZone !== undefined && (typeof timeZone !== "string" || !validTimeZone(timeZone))) throw new Error("timeZone: valid IANA time zone required");
  const cleanSchedule = typeof schedule === "string" ? schedule.trim() : null;
  // A cron that never fires (Feb 30) would make every due time empty. Checked in UTC: cheap, and a zone never removes a whole day.
  if (cleanSchedule && !expectedRuns(cleanSchedule, Date.now(), Date.now() + 400 * 86_400_000, 1)?.length) throw new Error("schedule: never runs in the next year");
  const cleanZone = typeof timeZone === "string" ? timeZone : null;
  if (probe === null || probe === undefined) return { schedule: cleanSchedule, timeZone: cleanZone, probe: null };
  if (!cleanSchedule) throw new Error("probe: schedule required");
  if (!probe || typeof probe !== "object" || Array.isArray(probe) || Object.keys(probe).some((k) => !["url", "expect", "page"].includes(k))) throw new Error("probe: URL and rules required");
  const p = probe as Record<string, unknown>;
  if (typeof p.url !== "string" || p.url.length > 2048) throw new Error("probe.url: public HTTPS URL required");
  let url: URL;
  try { url = new URL(p.url); } catch { throw new Error("probe.url: public HTTPS URL required"); }
  if (url.protocol !== "https:" || !url.hostname || isIP(url.hostname) || url.hostname.startsWith("[") || url.username || url.password || (url.port && url.port !== "443")) throw new Error("probe.url: public HTTPS URL required");
  if (p.page !== undefined) {
    if (p.expect !== undefined) throw new Error("probe: expect or page, not both");
    return { schedule: cleanSchedule, timeZone: cleanZone, probe: { url: url.toString(), page: validatePage(p.page) } };
  }
  if (!Array.isArray(p.expect) || p.expect.length < 1 || p.expect.length > 10) throw new Error("probe.expect: 1 to 10 rules required");
  const expect: ExpectRule[] = p.expect.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((k) => !["path", "op", "value"].includes(k))) throw new Error("probe.expect: invalid rule");
    const rule = raw as Record<string, unknown>;
    if (typeof rule.path !== "string" || !/^(?:[A-Za-z_$][\w$]*|\d+)(?:\.(?:[A-Za-z_$][\w$]*|\d+))*$/.test(rule.path) || rule.path.length > 160 || !["eq", "gte", "lte", "gt", "lt", "exists"].includes(String(rule.op))) throw new Error("probe.expect: invalid rule");
    if (rule.value !== undefined && (typeof rule.value !== "string" && typeof rule.value !== "number" && typeof rule.value !== "boolean" || typeof rule.value === "number" && !Number.isFinite(rule.value))) throw new Error("probe.expect: invalid value");
    if (rule.op !== "exists" && rule.value === undefined) throw new Error("probe.expect: value required");
    if (["gte", "lte", "gt", "lt"].includes(String(rule.op)) && typeof rule.value !== "number") throw new Error("probe.expect: numeric comparison requires a number");
    if (typeof rule.value === "string" && rule.value.length > 160) throw new Error("probe.expect: value too long");
    return { path: rule.path as string, op: rule.op as ExpectRule["op"], ...(rule.value !== undefined ? { value: rule.value as ExpectRule["value"] } : {}) };
  });
  return { schedule: cleanSchedule, timeZone: cleanZone, probe: { url: url.toString(), expect } };
}

const short = (value: unknown) => String(value === undefined ? "missing" : value === null ? "null" : value === "" ? "empty" : typeof value === "string" ? value : JSON.stringify(value)).slice(0, 60);
/** "exists" means it has a value: not missing, null, an empty string or an empty list. */
function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);
}

export function judge(json: unknown, expect: ExpectRule[], todayInZone: string): { ok: boolean; note: string } {
  const failures: string[] = [];
  for (const rule of expect) {
    let value: unknown = json;
    for (const key of rule.path.split(".")) value = value && typeof value === "object" && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
    const target = rule.value === "$today" ? todayInZone : rule.value;
    const ok = rule.op === "exists" ? hasValue(value) : rule.op === "eq" ? value === target : typeof value === "number" && typeof target === "number" && (rule.op === "gte" ? value >= target : rule.op === "lte" ? value <= target : rule.op === "gt" ? value > target : value < target);
    if (!ok) failures.push(`${rule.path}: expected ${rule.op === "exists" ? "a value" : `${rule.op === "eq" ? "" : rule.op === "gte" ? ">= " : rule.op === "lte" ? "<= " : rule.op === "gt" ? "> " : "< "}${short(target)}`}, got ${short(value)}`);
  }
  return { ok: failures.length === 0, note: failures.join("; ").slice(0, 300) };
}

export function todayInTimeZone(nowMs: number, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(nowMs).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dueProbeOccurrence(schedule: string, timeZone: string, createdMs: number, lastPingMs: number | null, nowMs: number): number | null {
  const runs = expectedRuns(schedule, nowMs - 2 * 60 * 60_000 - 60_000, nowMs, Number.POSITIVE_INFINITY, timeZone);
  const latest = runs?.at(-1);
  return latest !== undefined && latest >= createdMs && latest > (lastPingMs ?? -Infinity) && nowMs - latest <= 2 * 60 * 60_000 ? latest : null;
}

export async function safeGetJson(rawUrl: string): Promise<{ ok: true; json: unknown } | { ok: false; note: string }> {
  const page = await fetchPublic(rawUrl, "application/json", 64 * 1024);
  if (!page.ok) return page;
  if (page.status >= 300 && page.status < 400) return { ok: false, note: "redirected" };
  if (page.status < 200 || page.status >= 300) return { ok: false, note: `status ${page.status}` };
  if (page.capped) return { ok: false, note: "response too large" };
  try { return { ok: true, json: JSON.parse(page.body) }; } catch { return { ok: false, note: "not JSON" }; }
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") { const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1)); return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole; }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Every <a href> on a page: its visible text and its address, resolved against the page. */
export function pageLinks(html: string, base: string): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attr = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1]);
    if (!attr) continue;
    const raw = decode((attr[1] ?? attr[2] ?? attr[3] ?? "").trim());
    let href: string;
    try { href = new URL(raw, base).toString(); } catch { continue; }
    const text = decode(m[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    out.push({ text, href });
  }
  return out;
}

const hostOf = (href: string) => { try { return new URL(href).hostname.toLowerCase(); } catch { return ""; } };
const matchesHost = (host: string, want: string) => host === want || host === `www.${want}` || host.endsWith(`.${want}`);

/** Judges the link rules and lists the links that must answer. Pure, so it is tested without a network. */
export function judgePage(links: { text: string; href: string }[], rules: PageRules, base: string): { failures: string[]; toCheck: string[] } {
  const failures: string[] = [];
  for (const rule of rules.links ?? []) {
    const want = new URL(rule.hrefStartsWith, base).toString();
    const named = links.filter((l) => l.text.toLowerCase().includes(rule.text.toLowerCase()));
    if (!named.length) { failures.push(`no link named "${rule.text}"`); continue; }
    const wrong = named.find((l) => !l.href.startsWith(want) && !l.href.startsWith(rule.hrefStartsWith));
    if (wrong) failures.push(`"${rule.text}" goes to ${wrong.href.slice(0, 80)}, expected ${rule.hrefStartsWith.slice(0, 80)}`);
  }
  const toCheck: string[] = [];
  const seen = new Set<string>();
  for (const host of rules.answer ?? []) {
    const mine = links.filter((l) => l.href.startsWith("https://") && matchesHost(hostOf(l.href), host));
    if (!mine.length) { failures.push(`no link to ${host}`); continue; }
    for (const l of mine) {
      const u = new URL(l.href);
      const key = `${u.origin}${u.pathname}`;
      if (seen.has(key)) continue;
      seen.add(key);
      toCheck.push(key);
    }
  }
  return { failures, toCheck: toCheck.slice(0, MAX_ANSWER_LINKS) };
}

async function fetchPublic(rawUrl: string, accept: string, limit: number): Promise<{ ok: true; status: number; body: string; capped: boolean } | { ok: false; note: string }> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false, note: "invalid URL" }; }
  if (url.protocol !== "https:" || !url.hostname || isIP(url.hostname) || url.hostname.startsWith("[") || url.username || url.password || (url.port && url.port !== "443")) return { ok: false, note: "address not public" };
  const deadline = Date.now() + 10_000;
  try {
    const addresses = await resolvePublic(url.hostname, deadline - Date.now());
    const page = await pinnedGet(url, addresses[0], deadline - Date.now(), { "user-agent": "SpookyParticles-Check/1.0 (+https://spookyparticles.com)", accept }, limit);
    return { ok: true, status: page.status, body: page.body, capped: page.capped };
  } catch (err) {
    const message = (err as Error).message;
    return { ok: false, note: message === "timeout" ? "no reply in 10 s" : message === "address not public" ? "address not public" : "network error" };
  }
}

/** Runs a page check: the page answers 200 with HTML, its links match the rules, and the listed sites answer. */
export async function checkPage(rawUrl: string, rules: PageRules): Promise<{ ok: boolean; note: string }> {
  const page = await fetchPublic(rawUrl, "text/html", 512 * 1024);
  if (!page.ok) return { ok: false, note: page.note };
  if (page.status >= 300 && page.status < 400) return { ok: false, note: "redirected" };
  if (page.status !== 200) return { ok: false, note: `status ${page.status}` };
  const { failures, toCheck } = judgePage(pageLinks(page.body, rawUrl), rules, rawUrl);
  const answers = await Promise.all(toCheck.map(async (href) => {
    const reply = await fetchPublic(href, "text/html", 0);
    const host = hostOf(href);
    if (!reply.ok) return `${host}: ${reply.note}`;
    return reply.status >= 200 && reply.status < 400 ? null : `${host} answered ${reply.status}`;
  }));
  failures.push(...answers.filter((a): a is string => a !== null));
  return { ok: failures.length === 0, note: failures.join("; ").slice(0, 300) };
}

/** Each account may watch this many URLs, so a write key cannot turn Spooky into a traffic source. */
export const MAX_PROBES_PER_ACCOUNT = 25;
/** Probes per watcher run; the rest run on the next pass, 5 minutes later. */
export const MAX_PROBES_PER_RUN = 40;

export async function probeRoomLeft(userId: string, exceptJobId?: string): Promise<boolean> {
  const where = [eq(schema.checkinJobs.userId, userId), isNotNull(schema.checkinJobs.probe), ne(schema.checkinJobs.status, "retired")];
  if (exceptJobId) where.push(ne(schema.checkinJobs.id, exceptJobId));
  const [row] = await getDb().select({ n: count() }).from(schema.checkinJobs).where(and(...where));
  return (row?.n ?? 0) < MAX_PROBES_PER_ACCOUNT;
}

export async function runDueProbes(nowMs = Date.now()): Promise<{ ran: number; ok: number; failed: number }> {
  const rows = await getDb().select().from(schema.checkinJobs).where(and(isNotNull(schema.checkinJobs.probe), isNotNull(schema.checkinJobs.schedule), notInArray(schema.checkinJobs.status, ["paused", "retired"])));
  const due = rows.filter((job) => job.source === "manual" && job.probe && job.schedule && dueProbeOccurrence(job.schedule, job.timeZone ?? "UTC", job.createdAt.getTime(), job.lastPingAt?.getTime() ?? null, nowMs) !== null).slice(0, MAX_PROBES_PER_RUN);
  let ran = 0, ok = 0, failed = 0;
  for (let i = 0; i < due.length; i += 4) await Promise.all(due.slice(i, i + 4).map(async (job) => {
    try {
      const probe = job.probe!;
      let verdict: { ok: boolean; note: string };
      if ("page" in probe) verdict = await checkPage(probe.url, probe.page);
      else {
        const result = await safeGetJson(probe.url);
        verdict = result.ok ? judge(result.json, probe.expect, todayInTimeZone(nowMs, job.timeZone ?? "UTC")) : { ok: false, note: result.note };
      }
      await recordPingById(job.id, verdict.ok ? "ok" : "fail", verdict.note || null, nowMs);
      ran++; if (verdict.ok) ok++; else failed++;
    } catch (err) {
      ran++;
      failed++;
      console.error("[probes] check failed", String((err as Error).message).split("?")[0].slice(0, 160));
    }
  }));
  return { ran, ok, failed };
}
