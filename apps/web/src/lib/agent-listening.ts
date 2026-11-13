/**
 * Which coding sessions hear about which projects. Each time an agent key reads the incident
 * inbox for a project (the session hook does this at session start), one event is kept, at most
 * every 10 minutes per project. Today shows, per project: who last asked, when, and whether
 * anything is broken; and a broken project no session has asked about in 14 days.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { incidentsFor, matchesIncidentProject, type Incident } from "./incidents";

export const INBOX_READ = "agent.inbox_read";
const THROTTLE_MS = 10 * 60_000;
const WINDOW_MS = 14 * 86_400_000;

export type Listener = { project: string; lastAskedAt: string; agent: string | null; open: number };
export type Listening = { listeners: Listener[]; unheard: { project: string; open: number }[]; checkedAt: string };

type Read = { project: string; apiKeyId: string | null; at: Date };

/** Note that an agent asked about a project. Quiet on failure: the inbox answer matters more. */
export async function recordInboxRead(userId: string, apiKeyId: string, project: string) {
  const name = project.trim().toLowerCase().slice(0, 120);
  if (!name) return;
  try {
    const db = getDb();
    const since = new Date(Date.now() - THROTTLE_MS);
    const recent = await db
      .select({ properties: schema.events.properties })
      .from(schema.events)
      .where(and(eq(schema.events.userId, userId), eq(schema.events.name, INBOX_READ), gte(schema.events.createdAt, since)));
    if (recent.some((r) => r.properties.project === name)) return;
    await db.insert(schema.events).values({ userId, name: INBOX_READ, properties: { project: name, apiKeyId } });
  } catch (err) {
    console.warn("agent inbox read not recorded", err instanceof Error ? err.message : err);
  }
}

const incidentProject = (i: Incident) => i.project;

/** Pure: newest read per project, with its open problems, and broken projects nobody asked about. */
export function buildListening(reads: Read[], incidents: Incident[], keyNames: Map<string, string>, now: Date): Listening {
  const newest = new Map<string, Read>();
  for (const r of [...reads].sort((a, b) => b.at.getTime() - a.at.getTime())) if (!newest.has(r.project)) newest.set(r.project, r);
  const openFor = (project: string) => incidents.filter((i) => matchesIncidentProject(incidentProject(i), project)).length;
  const listeners = [...newest.values()].map((r) => ({
    project: r.project,
    lastAskedAt: r.at.toISOString(),
    agent: r.apiKeyId ? (keyNames.get(r.apiKeyId) ?? null) : null,
    open: openFor(r.project),
  }));
  const unheardCounts = new Map<string, number>();
  for (const i of incidents) {
    const p = incidentProject(i);
    if (!p || [...newest.keys()].some((name) => matchesIncidentProject(p, name))) continue;
    unheardCounts.set(p, (unheardCounts.get(p) ?? 0) + 1);
  }
  const unheard = [...unheardCounts].map(([project, open]) => ({ project, open })).sort((a, b) => a.project.localeCompare(b.project));
  return { listeners, unheard, checkedAt: now.toISOString() };
}

export async function listeningFor(userId: string): Promise<Listening> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({ properties: schema.events.properties, createdAt: schema.events.createdAt })
    .from(schema.events)
    .where(and(eq(schema.events.userId, userId), eq(schema.events.name, INBOX_READ), gte(schema.events.createdAt, new Date(now.getTime() - WINDOW_MS))))
    .orderBy(desc(schema.events.createdAt))
    .limit(500);
  const reads: Read[] = rows
    .filter((r) => typeof r.properties.project === "string")
    .map((r) => ({ project: r.properties.project as string, apiKeyId: typeof r.properties.apiKeyId === "string" ? r.properties.apiKeyId : null, at: r.createdAt }));
  const keyIds = [...new Set(reads.map((r) => r.apiKeyId).filter((x): x is string => Boolean(x)))];
  const keys = keyIds.length
    ? await db.select({ id: schema.apiKeys.id, name: schema.apiKeys.name }).from(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), inArray(schema.apiKeys.id, keyIds)))
    : [];
  const { incidents } = await incidentsFor(userId);
  return buildListening(reads, incidents, new Map(keys.map((k) => [k.id, k.name])), now);
}
