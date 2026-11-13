/**
 * Claim a break, so two coding sessions don't fix the same thing. A claim is per project and
 * lasts 30 minutes; the same agent key asking again renews it. It ends early when a fix check
 * for that project answers "fixed". Claims live in the events table; nothing is written to a host.
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "./actor";
import { FIX_CONFIRMED } from "./catches";
import { matchesIncidentProject } from "./incidents";

export const CLAIMED = "incident.claimed";
export const CLAIM_MS = 30 * 60_000;

export type Claim = { project: string; apiKeyId: string | null; agent: string | null; at: string; until: string };
type Row = { name: string; properties: Record<string, unknown>; createdAt: Date };

/** Pure: the live claims, newest per project, minus any a later "fixed" check ended. */
export function liveClaims(rows: Row[], keyNames: Map<string, string>, nowMs: number): Claim[] {
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const out = new Map<string, Claim>();
  for (const r of sorted) {
    if (r.name !== CLAIMED || typeof r.properties.project !== "string") continue;
    const project = r.properties.project;
    if (out.has(project) || nowMs - r.createdAt.getTime() > CLAIM_MS) continue;
    const ended = sorted.some((e) => e.name === FIX_CONFIRMED && e.properties.verdict === "fixed" && e.createdAt > r.createdAt && matchesIncidentProject(project, String(e.properties.project ?? "")));
    if (ended) continue;
    const apiKeyId = typeof r.properties.apiKeyId === "string" ? r.properties.apiKeyId : null;
    out.set(project, { project, apiKeyId, agent: apiKeyId ? (keyNames.get(apiKeyId) ?? null) : null, at: r.createdAt.toISOString(), until: new Date(r.createdAt.getTime() + CLAIM_MS).toISOString() });
  }
  return [...out.values()];
}

export function claimFor(claims: Claim[], project: string | null): Claim | null {
  if (!project) return null;
  return claims.find((c) => matchesIncidentProject(project, c.project) || matchesIncidentProject(c.project, project)) ?? null;
}

export async function claimsFor(userId: string, nowMs = Date.now()): Promise<Claim[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({ name: schema.events.name, properties: schema.events.properties, createdAt: schema.events.createdAt })
      .from(schema.events)
      .where(and(eq(schema.events.userId, userId), inArray(schema.events.name, [CLAIMED, FIX_CONFIRMED]), gte(schema.events.createdAt, new Date(nowMs - CLAIM_MS))));
    const ids = [...new Set(rows.map((r) => r.properties.apiKeyId).filter((x): x is string => typeof x === "string"))];
    const keys = ids.length ? await db.select({ id: schema.apiKeys.id, name: schema.apiKeys.name }).from(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), inArray(schema.apiKeys.id, ids))) : [];
    return liveClaims(rows, new Map(keys.map((k) => [k.id, k.name])), nowMs);
  } catch (err) {
    console.warn("claims not read", err instanceof Error ? err.message : err);
    return [];
  }
}

export type ClaimResult = { claimed: boolean; yours: boolean; claim: Claim; message: string };

/** Claim the project's breaks for this agent key, unless another key holds a live claim. */
export async function claimBreak(actor: Actor, project: string, nowMs = Date.now()): Promise<ClaimResult> {
  const name = project.trim().toLowerCase().slice(0, 120);
  const held = claimFor(await claimsFor(actor.userId, nowMs), name);
  const me = actor.apiKeyId ?? null;
  if (held && held.apiKeyId !== me) {
    const who = held.agent ?? (held.apiKeyId ? "another agent" : "your human, from the web app");
    return { claimed: false, yours: false, claim: held, message: `${who} claimed ${held.project} at ${held.at}, until ${held.until}. Leave it to them unless your human says otherwise.` };
  }
  const at = new Date(nowMs);
  await getDb().insert(schema.events).values({ userId: actor.userId, name: CLAIMED, properties: { project: name, apiKeyId: me }, createdAt: at });
  const claim: Claim = { project: name, apiKeyId: me, agent: held?.agent ?? null, at: at.toISOString(), until: new Date(nowMs + CLAIM_MS).toISOString() };
  return { claimed: true, yours: true, claim, message: `Claimed ${name} until ${claim.until}. Other sessions will see it is yours. A fix check that answers "fixed" ends the claim; asking again renews it.` };
}
