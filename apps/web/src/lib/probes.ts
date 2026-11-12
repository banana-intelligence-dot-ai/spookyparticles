import { isIP } from "node:net";
import { and, count, eq, isNotNull, ne, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { recordPingById } from "@/lib/checkins";
import { pinnedGet, resolvePublic } from "@/lib/net-safety";
import { expectedRuns, validSchedule, validTimeZone } from "@/lib/vercel-schedules";

export type ExpectRule = { path: string; op: "eq" | "gte" | "lte" | "gt" | "lt" | "exists"; value?: string | number | boolean };
export type Probe = { url: string; expect: ExpectRule[] };

export function validateOutcomeInput(schedule: unknown, timeZone: unknown, probe: unknown): { schedule: string | null; timeZone: string | null; probe: Probe | null } {
  if (schedule !== null && schedule !== undefined && (typeof schedule !== "string" || !validSchedule(schedule))) throw new Error("schedule: valid 5-field cron required");
  if (timeZone !== null && timeZone !== undefined && (typeof timeZone !== "string" || !validTimeZone(timeZone))) throw new Error("timeZone: valid IANA time zone required");
  const cleanSchedule = typeof schedule === "string" ? schedule.trim() : null;
  // A cron that never fires (Feb 30) would make every due time empty. Checked in UTC: cheap, and a zone never removes a whole day.
  if (cleanSchedule && !expectedRuns(cleanSchedule, Date.now(), Date.now() + 400 * 86_400_000, 1)?.length) throw new Error("schedule: never runs in the next year");
  const cleanZone = typeof timeZone === "string" ? timeZone : null;
  if (probe === null || probe === undefined) return { schedule: cleanSchedule, timeZone: cleanZone, probe: null };
  if (!cleanSchedule) throw new Error("probe: schedule required");
  if (!probe || typeof probe !== "object" || Array.isArray(probe) || Object.keys(probe).some((k) => !["url", "expect"].includes(k))) throw new Error("probe: URL and rules required");
  const p = probe as Record<string, unknown>;
  if (typeof p.url !== "string" || p.url.length > 2048) throw new Error("probe.url: public HTTPS URL required");
  let url: URL;
  try { url = new URL(p.url); } catch { throw new Error("probe.url: public HTTPS URL required"); }
  if (url.protocol !== "https:" || !url.hostname || isIP(url.hostname) || url.hostname.startsWith("[") || url.username || url.password || (url.port && url.port !== "443")) throw new Error("probe.url: public HTTPS URL required");
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

const short = (value: unknown) => String(value === undefined ? "missing" : value === null ? "null" : typeof value === "string" ? value : JSON.stringify(value)).slice(0, 60);
export function judge(json: unknown, expect: ExpectRule[], todayInZone: string): { ok: boolean; note: string } {
  const failures: string[] = [];
  for (const rule of expect) {
    let value: unknown = json;
    for (const key of rule.path.split(".")) value = value && typeof value === "object" && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
    const target = rule.value === "$today" ? todayInZone : rule.value;
    const ok = rule.op === "exists" ? value !== undefined : rule.op === "eq" ? value === target : typeof value === "number" && typeof target === "number" && (rule.op === "gte" ? value >= target : rule.op === "lte" ? value <= target : rule.op === "gt" ? value > target : value < target);
    if (!ok) failures.push(`${rule.path}: expected ${rule.op === "exists" ? "present" : `${rule.op === "eq" ? "" : rule.op === "gte" ? ">= " : rule.op === "lte" ? "<= " : rule.op === "gt" ? "> " : "< "}${short(target)}`}, got ${short(value)}`);
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
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false, note: "invalid URL" }; }
  if (url.protocol !== "https:" || !url.hostname || isIP(url.hostname) || url.hostname.startsWith("[") || url.username || url.password || (url.port && url.port !== "443")) return { ok: false, note: "address not public" };
  const deadline = Date.now() + 10_000;
  try {
    const addresses = await resolvePublic(url.hostname, deadline - Date.now());
    const page = await pinnedGet(url, addresses[0], deadline - Date.now(), { "user-agent": "SpookyParticles-Check/1.0 (+https://spookyparticles.com)", accept: "application/json" }, 64 * 1024);
    if (page.status >= 300 && page.status < 400) return { ok: false, note: "redirected" };
    if (page.status < 200 || page.status >= 300) return { ok: false, note: `status ${page.status}` };
    if (page.capped) return { ok: false, note: "response too large" };
    try { return { ok: true, json: JSON.parse(page.body) }; } catch { return { ok: false, note: "not JSON" }; }
  } catch (err) {
    return { ok: false, note: (err as Error).message === "timeout" ? "no reply in 10 s" : (err as Error).message === "address not public" ? "address not public" : "network error" };
  }
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
      const result = await safeGetJson(job.probe!.url);
      const verdict = result.ok ? judge(result.json, job.probe!.expect, todayInTimeZone(nowMs, job.timeZone ?? "UTC")) : { ok: false, note: result.note };
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
