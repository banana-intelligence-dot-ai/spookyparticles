/**
 * Stop watching: the owner (or their agent, with write) says a whole project, or one kind of
 * notice on it, should stop coming through. A project that ended, a test site that is meant to be
 * down. A muted project sends no pings, puts nothing in the agent inbox and has no open items;
 * what already happened stays in History. Each change is an event plus an audit line, newest event
 * per key wins, and unmute undoes it. Nothing is deleted and nothing is written to a host.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "./actor";
import { appendAudit } from "./audit";
import { sameProject } from "./break-guide";
import { ApiError } from "./http";

export const MUTED = "notice.muted";
export const UNMUTED = "notice.unmuted";

/** The kinds a mute can name. Null (or "all") is the whole project. */
export const MUTE_KINDS = ["deploy", "job", "site", "server_errors", "check"] as const;
export type MuteKind = (typeof MUTE_KINDS)[number];
export type Mute = { key: string; project: string; kind: MuteKind | null; reason: string | null; at: string; by: string | null };

export const muteKey = (project: string, kind: MuteKind | null) => `${project.trim().toLowerCase()}|${kind ?? "*"}`;

type Row = { name: string; properties: Record<string, unknown>; createdAt: Date };
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Pure: the mutes whose newest event is a mute, newest first. */
export function mutesFrom(rows: Row[]): Mute[] {
  const newest = new Map<string, Row>();
  for (const r of rows) {
    const key = str(r.properties.key);
    if (!key) continue;
    const seen = newest.get(key);
    if (!seen || r.createdAt > seen.createdAt) newest.set(key, r);
  }
  return [...newest.values()]
    .filter((r) => r.name === MUTED && str(r.properties.project))
    .map((r) => ({
      key: r.properties.key as string,
      project: r.properties.project as string,
      kind: (MUTE_KINDS as readonly string[]).includes(r.properties.kind as string) ? (r.properties.kind as MuteKind) : null,
      reason: str(r.properties.reason),
      at: r.createdAt.toISOString(),
      by: str(r.properties.by),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Pure: the mute that covers this project and kind, if any. A whole-project mute covers every kind. */
export function muteFor(mutes: Mute[], project: string | null | undefined, kind?: MuteKind | null): Mute | null {
  if (!project) return null;
  return mutes.find((m) => sameProject(m.project, project) && (m.kind === null || (kind != null && m.kind === kind))) ?? null;
}

/** Alert kinds as they are stored, mapped to the kind a mute names. Expirations follow the whole-project mute only. */
export function muteKindOfAlert(alertKind: string): MuteKind | null {
  if (alertKind.startsWith("deploy")) return "deploy";
  if (alertKind.startsWith("job")) return "job";
  if (alertKind.startsWith("site")) return "site";
  if (alertKind.startsWith("server_errors")) return "server_errors";
  return null;
}

/** Reads the mute events. Throws when the read fails, so a writer never acts on a guess. */
async function readMutes(userId: string): Promise<Mute[]> {
  const rows = await getDb()
    .select({ name: schema.events.name, properties: schema.events.properties, createdAt: schema.events.createdAt })
    .from(schema.events)
    .where(and(eq(schema.events.userId, userId), inArray(schema.events.name, [MUTED, UNMUTED])));
  return mutesFrom(rows);
}

/** For readers: a failed read means nothing is muted, so alerts still go out. */
export async function mutesFor(userId: string): Promise<Mute[]> {
  try {
    return await readMutes(userId);
  } catch (err) {
    console.warn("mutes not read", err instanceof Error ? err.message : err);
    return [];
  }
}

/** For the alert senders: true when the owner stopped watching this project, or this kind on it. */
export async function alertMuted(userId: string, project: string | null | undefined, alertKind: string): Promise<boolean> {
  if (!project) return false;
  return Boolean(muteFor(await mutesFor(userId), project, muteKindOfAlert(alertKind)));
}

export async function setMuted(actor: Actor, input: { project: string; kind: MuteKind | null; reason: string | null }, muted: boolean): Promise<{ muted: boolean; mute: Mute | null }> {
  const key = muteKey(input.project, input.kind);
  const current = await readMutes(actor.userId);
  const before = current.find((m) => m.key === key) ?? null;
  if (Boolean(before) !== muted) {
    const by = actor.via === "api_key" ? actor.label : "you";
    await getDb().insert(schema.events).values({ userId: actor.userId, name: muted ? MUTED : UNMUTED, properties: { key, project: input.project, kind: input.kind, reason: input.reason, by, apiKeyId: actor.apiKeyId ?? null } });
    await appendAudit({ actor: actor.label, userId: actor.userId, action: muted ? "notice.mute" : "notice.unmute", target: `mute:${key}`, before: { muted: Boolean(before) }, after: { muted, project: input.project, kind: input.kind, reason: input.reason } });
  }
  const after = muted ? ((await readMutes(actor.userId)).find((m) => m.key === key) ?? null) : null;
  return { muted, mute: after };
}

/** The project, kind and reason from a request body or tool input. Throws 400 when the project is missing or the kind is unknown. */
export function muteInput(body: { project?: unknown; kind?: unknown; reason?: unknown } | null): { project: string; kind: MuteKind | null; reason: string | null } {
  const project = typeof body?.project === "string" ? body.project.trim() : "";
  if (!project || project.length > 120) throw new ApiError(400, "project_required", "Send the project's name, like owner/repo.");
  const rawKind = body?.kind;
  let kind: MuteKind | null = null;
  if (rawKind !== undefined && rawKind !== null && rawKind !== "all") {
    if (typeof rawKind !== "string" || !(MUTE_KINDS as readonly string[]).includes(rawKind)) throw new ApiError(400, "bad_kind", `kind is one of ${MUTE_KINDS.join(", ")}, or all.`);
    kind = rawKind as MuteKind;
  }
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : null;
  return { project, kind, reason };
}
