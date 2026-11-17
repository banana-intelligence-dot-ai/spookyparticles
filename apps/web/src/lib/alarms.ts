/**
 * Alarm checks: the owner (or their agent, with write) says a check measures the real world.
 * A failed alarm is reported as an alarm, and fix jobs work on what it measures instead of
 * weakening or repairing the check. Each change is an event plus an audit line, newest event
 * per key wins, and clearing an alarm undoes it. Nothing is deleted or written to a host.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "./actor";
import { appendAudit } from "./audit";
import { sameProject } from "./break-guide";
import { ApiError } from "./http";

export const ALARM_SET = "check.alarm_set";
export const ALARM_CLEARED = "check.alarm_cleared";

export type Alarm = { key: string; project: string; check: string; note: string | null; at: string; by: string | null };

export const normCheck = (value: string) => value.trim().toLowerCase().split(/[\\/]/).pop()!.replace(/\.ya?ml$/i, "");
export const alarmKey = (project: string, check: string) => `${project.trim().toLowerCase()}|${normCheck(check)}`;

type Row = { name: string; properties: Record<string, unknown>; createdAt: Date };
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Pure: the alarms whose newest event is alarm_set, newest first. */
export function alarmsFrom(rows: Row[]): Alarm[] {
  const newest = new Map<string, Row>();
  for (const r of rows) {
    const key = str(r.properties.key);
    if (!key) continue;
    const seen = newest.get(key);
    if (!seen || r.createdAt > seen.createdAt) newest.set(key, r);
  }
  return [...newest.values()]
    .filter((r) => r.name === ALARM_SET && str(r.properties.project) && str(r.properties.check))
    .map((r) => ({
      key: r.properties.key as string,
      project: r.properties.project as string,
      check: r.properties.check as string,
      note: str(r.properties.note),
      at: r.createdAt.toISOString(),
      by: str(r.properties.by),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Pure: the alarm for this project and any supplied check name, if one is set. */
export function alarmFor(alarms: Alarm[], project: string | null | undefined, names: (string | null | undefined)[]): Alarm | null {
  if (!project) return null;
  const checks = new Set(names.filter((name): name is string => Boolean(name)).map(normCheck));
  return alarms.find((alarm) => sameProject(alarm.project, project) && checks.has(normCheck(alarm.check))) ?? null;
}

/** Reads alarm events. Throws when the read fails, so a writer never acts on a guess. */
async function readAlarms(userId: string): Promise<Alarm[]> {
  const rows = await getDb()
    .select({ name: schema.events.name, properties: schema.events.properties, createdAt: schema.events.createdAt })
    .from(schema.events)
    .where(and(eq(schema.events.userId, userId), inArray(schema.events.name, [ALARM_SET, ALARM_CLEARED])));
  return alarmsFrom(rows);
}

/** For readers: a failed read means no check is treated as an alarm. */
export async function alarmsFor(userId: string): Promise<Alarm[]> {
  try {
    return await readAlarms(userId);
  } catch (err) {
    console.warn("alarms not read", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function setAlarm(actor: Actor, input: { project: string; check: string; note: string | null }, on: boolean): Promise<{ alarm: boolean; value: Alarm | null }> {
  const key = alarmKey(input.project, input.check);
  const current = await readAlarms(actor.userId);
  const before = current.find((alarm) => alarm.key === key) ?? null;
  if (Boolean(before) !== on || (on && before && (before.note !== input.note || before.check !== input.check))) {
    const by = actor.via === "api_key" ? actor.label : "you";
    await getDb().insert(schema.events).values({ userId: actor.userId, name: on ? ALARM_SET : ALARM_CLEARED, properties: { key, project: input.project, check: input.check, note: input.note, by, apiKeyId: actor.apiKeyId ?? null } });
    await appendAudit({ actor: actor.label, userId: actor.userId, action: on ? "check.alarm_set" : "check.alarm_clear", target: `alarm:${key}`, before: { alarm: Boolean(before) }, after: { alarm: on, project: input.project, check: input.check, note: input.note } });
  }
  const after = on ? ((await readAlarms(actor.userId)).find((alarm) => alarm.key === key) ?? null) : null;
  return { alarm: on, value: after };
}

/** The project, check and note from a request body or tool input. */
export function alarmInput(body: { project?: unknown; check?: unknown; note?: unknown } | null): { project: string; check: string; note: string | null } {
  const project = typeof body?.project === "string" ? body.project.trim() : "";
  if (!project || project.length > 120) throw new ApiError(400, "project_required", "Send the project's name, like owner/repo.");
  const check = typeof body?.check === "string" ? body.check.trim() : "";
  if (!check || check.length > 120) throw new ApiError(400, "check_required", "Send the check or workflow name.");
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  return { project, check, note };
}

/** Pure: the instruction placed before an alarm failure. */
export function alarmLine(alarm: Pick<Alarm, "check" | "note">): string {
  return `Alarm about the real world, not a broken check: ${alarm.check}${alarm.note ? ` (${alarm.note})` : ""}.`;
}
