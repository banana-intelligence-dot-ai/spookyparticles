/**
 * Agents: the coding agents and computers that hold a key, and what each one did with it. Which
 * projects it asked about (14 days), what it holds right now, and how many breaks were fixed
 * after it heard (30 days). Plus the broken projects no agent has asked about.
 * Reads only. Key material never leaves the server: a key is shown once, when it is made.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { INBOX_READ, listeningFor } from "./agent-listening";
import { catchesFor, type Catch } from "./catches";
import { claimsFor, type Claim } from "./claims";
import { duration } from "./fix-stats";

const ASKED_MS = 14 * 86_400_000;
const MAX_ASKED = 8;

export type AgentState = "live" | "expired" | "revoked";
export type AgentView = {
  id: string;
  name: string;
  /** The first characters of the key, to tell two keys apart. Not a secret. */
  prefix: string;
  scopes: string[];
  state: AgentState;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  /** Projects it asked about in the last 14 days, newest first. */
  asked: { project: string; at: string }[];
  askedTotal: number;
  /** Breaks it holds right now. */
  claims: { project: string; at: string; until: string }[];
  /** Breaks fixed in the last 30 days after this agent asked about them. */
  fixed: number;
  lastFix: { project: string | null; what: string; caughtAt: string; fixedAt: string; took: string } | null;
};
export type AgentsReport = {
  agents: AgentView[];
  /** Broken projects no agent has asked about in 14 days. */
  unheard: { project: string; open: number }[];
  summary: { live: number; fixed: number; listening: number };
  checkedAt: string;
};

type KeyRow = { id: string; name: string; prefix: string; scopes: string[]; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null; expiresAt: Date | null };
type Read = { project: string; apiKeyId: string | null; at: Date };
const RANK: Record<AgentState, number> = { live: 0, expired: 1, revoked: 2 };

/** Pure: one row per key, live ones first, the most recently used on top. */
export function buildAgents(input: { keys: KeyRow[]; reads: Read[]; claims: Claim[]; catches: Catch[]; unheard: { project: string; open: number }[]; now: number }): AgentsReport {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const agents = input.keys.map((k): AgentView => {
    const newest = new Map<string, Date>();
    for (const r of input.reads) if (r.apiKeyId === k.id && (!newest.has(r.project) || r.at > newest.get(r.project)!)) newest.set(r.project, r.at);
    const asked = [...newest].map(([project, at]) => ({ project, at: at.toISOString() })).sort((a, b) => b.at.localeCompare(a.at));
    const fixes = input.catches.filter((c) => c.status === "fixed" && c.fixedAt && c.agentKeyId === k.id).sort((a, b) => (b.fixedAt as string).localeCompare(a.fixedAt as string));
    const last = fixes[0];
    return {
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      state: k.revokedAt ? "revoked" : k.expiresAt && k.expiresAt.getTime() <= input.now ? "expired" : "live",
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: iso(k.lastUsedAt),
      revokedAt: iso(k.revokedAt),
      expiresAt: iso(k.expiresAt),
      asked: asked.slice(0, MAX_ASKED),
      askedTotal: asked.length,
      claims: input.claims.filter((c) => c.apiKeyId === k.id).map((c) => ({ project: c.project, at: c.at, until: c.until })),
      fixed: fixes.length,
      lastFix: last ? { project: last.project, what: last.what, caughtAt: last.caughtAt, fixedAt: last.fixedAt as string, took: duration(Date.parse(last.fixedAt as string) - Date.parse(last.caughtAt)) } : null,
    };
  });
  agents.sort((a, b) => RANK[a.state] - RANK[b.state] || (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || b.createdAt.localeCompare(a.createdAt));
  const live = agents.filter((a) => a.state === "live");
  return {
    agents,
    unheard: input.unheard,
    summary: { live: live.length, fixed: agents.reduce((n, a) => n + a.fixed, 0), listening: live.filter((a) => a.asked.length).length },
    checkedAt: new Date(input.now).toISOString(),
  };
}

export async function agentsFor(userId: string): Promise<AgentsReport> {
  const db = getDb();
  const now = Date.now();
  const [keys, readRows, claims, catches, listening] = await Promise.all([
    db
      .select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, createdAt: schema.apiKeys.createdAt, lastUsedAt: schema.apiKeys.lastUsedAt, revokedAt: schema.apiKeys.revokedAt, expiresAt: schema.apiKeys.expiresAt })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, userId)),
    db
      .select({ properties: schema.events.properties, createdAt: schema.events.createdAt })
      .from(schema.events)
      .where(and(eq(schema.events.userId, userId), eq(schema.events.name, INBOX_READ), gte(schema.events.createdAt, new Date(now - ASKED_MS))))
      .orderBy(desc(schema.events.createdAt))
      .limit(1000),
    claimsFor(userId, now),
    catchesFor(userId),
    listeningFor(userId),
  ]);
  const reads: Read[] = readRows
    .filter((r) => typeof r.properties.project === "string")
    .map((r) => ({ project: r.properties.project as string, apiKeyId: typeof r.properties.apiKeyId === "string" ? r.properties.apiKeyId : null, at: r.createdAt }));
  return buildAgents({ keys, reads, claims, catches: catches.catches, unheard: listening.unheard, now });
}
