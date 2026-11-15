/**
 * Ignore one break. The owner says a failed deploy does not matter (a retired project, a check
 * nobody needs), so Spooky stops counting it: off Today, off the agent inbox, out of project
 * health. The ignore names that exact failure (the deployment and when it failed), so the next
 * failure shows again. Undo restores it. Each change is an event plus an audit line; nothing is
 * written to a host.
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "./actor";
import { appendAudit } from "./audit";
import { ApiError } from "./http";

export const IGNORED = "incident.ignored";
export const UNIGNORED = "incident.unignored";

/** The identity of one failure: the deployment node and the moment it failed. */
export function breakKey(nodeId: string, at: string | null): string {
  return `${nodeId}@${at ?? ""}`;
}

type Row = { name: string; properties: Record<string, unknown>; createdAt: Date };

/** Pure: the keys whose newest event is an ignore. */
export function ignoredFrom(rows: Row[]): Set<string> {
  const newest = new Map<string, Row>();
  for (const r of rows) {
    const key = r.properties.key;
    if (typeof key !== "string") continue;
    const seen = newest.get(key);
    if (!seen || r.createdAt > seen.createdAt) newest.set(key, r);
  }
  return new Set([...newest].filter(([, r]) => r.name === IGNORED).map(([k]) => k));
}

const readRows = (userId: string) =>
  getDb()
    .select({ name: schema.events.name, properties: schema.events.properties, createdAt: schema.events.createdAt })
    .from(schema.events)
    .where(and(eq(schema.events.userId, userId), inArray(schema.events.name, [IGNORED, UNIGNORED])));

/** For readers: a failed read means nothing is ignored, so breaks still show. */
export async function ignoredKeys(userId: string): Promise<Set<string>> {
  try {
    return ignoredFrom(await readRows(userId));
  } catch (err) {
    console.warn("ignores not read", err instanceof Error ? err.message : err);
    return new Set();
  }
}

/** Ignore or restore each key that is not already there. One read, which throws when it fails, so a writer never acts on a guess. */
async function setKeys(actor: Actor, keys: string[], project: string, ignored: boolean, what: string | null): Promise<void> {
  const standing = ignoredFrom(await readRows(actor.userId));
  for (const key of keys) {
    if (standing.has(key) === ignored) continue;
    await getDb().insert(schema.events).values({ userId: actor.userId, name: ignored ? IGNORED : UNIGNORED, properties: { key, project, what, by: actor.via === "api_key" ? actor.label : "you", apiKeyId: actor.apiKeyId ?? null } });
    await appendAudit({ actor: actor.label, userId: actor.userId, action: ignored ? "incident.ignore" : "incident.unignore", target: `break:${key}`, before: { ignored: !ignored }, after: { ignored, project } });
  }
}

export async function setIgnored(actor: Actor, key: string, project: string, ignored: boolean, what: string | null = null): Promise<{ key: string; ignored: boolean }> {
  await setKeys(actor, [key], project, ignored, what);
  return { key, ignored };
}

export type Cleared = { key: string; project: string | null; what: string | null; at: string; by: string | null };
const text = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Pure: the notices that stand cleared, newest first, with the words kept when they were cleared. */
export function clearedFrom(rows: Row[]): Cleared[] {
  const keys = ignoredFrom(rows);
  const newest = new Map<string, Row>();
  for (const r of rows) {
    const key = r.properties.key;
    if (typeof key !== "string" || !keys.has(key) || r.name !== IGNORED) continue;
    const seen = newest.get(key);
    if (!seen || r.createdAt > seen.createdAt) newest.set(key, r);
  }
  return [...newest]
    .map(([key, r]) => ({ key, project: text(r.properties.project), what: text(r.properties.what), at: r.createdAt.toISOString(), by: text(r.properties.by) }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** The notices the owner cleared and has not restored, newest first. */
export async function clearedFor(userId: string, limit = 100): Promise<Cleared[]> {
  return clearedFrom(await readRows(userId)).slice(0, limit);
}

const MAX_KEYS = 50;

/** One or many notice keys from a request body or tool input, with the project and the notice's words. Throws 400 when no key is sent. */
export function clearInput(body: { key?: unknown; keys?: unknown; project?: unknown; what?: unknown } | null): { keys: string[]; project: string; what: string | null } {
  const raw = Array.isArray(body?.keys) ? body.keys : body?.key !== undefined ? [body.key] : [];
  const valid = raw.filter((k): k is string => typeof k === "string").map((k) => k.trim()).filter((k) => k && k.length <= 200);
  const keys = [...new Set(valid)];
  if (!keys.length || valid.length !== raw.length || keys.length > MAX_KEYS) throw new ApiError(400, "key_required", `Send the notice's key, or up to ${MAX_KEYS} keys, from the open list.`);
  const project = typeof body?.project === "string" ? body.project.trim().slice(0, 120) : "";
  const what = typeof body?.what === "string" && body.what.trim() ? body.what.trim().slice(0, 200) : null;
  return { keys, project, what };
}

/** Clear or restore each notice. Every change is its own event and audit line; nothing is deleted. */
export async function setCleared(actor: Actor, input: { keys: string[]; project: string; what: string | null }, cleared: boolean): Promise<{ keys: string[]; cleared: boolean }> {
  await setKeys(actor, input.keys, input.project, cleared, input.what);
  return { keys: input.keys, cleared };
}

/** The break key and project from a request body or tool input. Throws 400 when the key is missing. */
export function ignoreInput(body: { key?: unknown; project?: unknown } | null): { key: string; project: string } {
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const project = typeof body?.project === "string" ? body.project.trim().slice(0, 120) : "";
  if (!key || key.length > 200) throw new ApiError(400, "key_required", "Send the break's key from the project's deployments.");
  return { key, project };
}

type JobAlert = { kind: string; key: string; payload: Record<string, unknown>; createdAt: Date };

/** Pure: jobs whose newest alert is a quiet-or-failed one the owner cleared. A recovery or a newer break after it means it is no longer cleared. */
export function clearedJobsFrom(alerts: JobAlert[], ignored: Set<string>): Set<string> {
  const newest = new Map<string, JobAlert>();
  for (const a of alerts) {
    const jobId = a.payload.jobId;
    if (typeof jobId !== "string") continue;
    const seen = newest.get(jobId);
    if (!seen || a.createdAt > seen.createdAt) newest.set(jobId, a);
  }
  return new Set([...newest].filter(([, a]) => a.kind !== "job_recovered" && ignored.has(a.key)).map(([jobId]) => jobId));
}

/** Jobs the owner cleared from the open list: their open episode's notice, or a never-checked-in job. Keeps cleared jobs out of the agent inbox. */
export async function clearedJobIds(userId: string): Promise<Set<string>> {
  const ignored = await ignoredKeys(userId);
  if (!ignored.size) return new Set();
  const never = [...ignored].filter((k) => k.startsWith("never:")).map((k) => k.slice("never:".length));
  try {
    const alerts = await getDb()
      .select({ kind: schema.alerts.kind, key: schema.alerts.key, payload: schema.alerts.payload, createdAt: schema.alerts.createdAt })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.userId, userId), inArray(schema.alerts.kind, ["job_quiet", "job_failed", "job_recovered"]), gte(schema.alerts.createdAt, new Date(Date.now() - 60 * 86_400_000))));
    return new Set([...never, ...clearedJobsFrom(alerts, ignored)]);
  } catch (err) {
    console.warn("cleared jobs not read", err instanceof Error ? err.message : err);
    return new Set(never);
  }
}
