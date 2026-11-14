/**
 * Ignore one break. The owner says a failed deploy does not matter (a retired project, a check
 * nobody needs), so Spooky stops counting it: off Today, off the agent inbox, out of project
 * health. The ignore names that exact failure (the deployment and when it failed), so the next
 * failure shows again. Undo restores it. Each change is an event plus an audit line; nothing is
 * written to a host.
 */
import { and, eq, inArray } from "drizzle-orm";
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

export async function ignoredKeys(userId: string): Promise<Set<string>> {
  try {
    const rows = await getDb()
      .select({ name: schema.events.name, properties: schema.events.properties, createdAt: schema.events.createdAt })
      .from(schema.events)
      .where(and(eq(schema.events.userId, userId), inArray(schema.events.name, [IGNORED, UNIGNORED])));
    return ignoredFrom(rows);
  } catch (err) {
    console.warn("ignores not read", err instanceof Error ? err.message : err);
    return new Set();
  }
}

export async function setIgnored(actor: Actor, key: string, project: string, ignored: boolean): Promise<{ key: string; ignored: boolean }> {
  const before = (await ignoredKeys(actor.userId)).has(key);
  if (before !== ignored) {
    await getDb().insert(schema.events).values({ userId: actor.userId, name: ignored ? IGNORED : UNIGNORED, properties: { key, project, apiKeyId: actor.apiKeyId ?? null } });
    await appendAudit({ actor: actor.label, userId: actor.userId, action: ignored ? "incident.ignore" : "incident.unignore", target: `break:${key}`, before: { ignored: before }, after: { ignored, project } });
  }
  return { key, ignored };
}

/** The break key and project from a request body or tool input. Throws 400 when the key is missing. */
export function ignoreInput(body: { key?: unknown; project?: unknown } | null): { key: string; project: string } {
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const project = typeof body?.project === "string" ? body.project.trim().slice(0, 120) : "";
  if (!key || key.length > 200) throw new ApiError(400, "key_required", "Send the break's key from the project's deployments.");
  return { key, project };
}
