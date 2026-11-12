import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Connection } from "@/db/schema";
import { appendAudit } from "./audit";
import { decrypt, encrypt } from "./crypto";
import { revokeConnection } from "./connections";
import { identifyToken, teamQuery, vercelGet } from "./providers/vercel";

const PREFIX = "vercel-install:";
const READ_SCOPES = ["projects:read", "deployments:read", "domains:read"];
/** Verified 2026-11-10: Vercel integration scopes omit request history, while pasted tokens can read it. */
export const INTEGRATION_READS_REQUEST_HISTORY = false;

export type VercelInstallMeta = {
  via: "integration";
  installationId: string;
  configurationId: string;
  teamId: string | null;
};

/** The connection table has no JSON column. Its existing text array holds one
 * namespaced JSON entry; the public connection shape filters it out. */
export function readVercelInstallMeta(scopes: string[]): VercelInstallMeta | null {
  const raw = scopes.find((s) => s.startsWith(PREFIX));
  if (!raw) return null;
  try {
    const meta = JSON.parse(raw.slice(PREFIX.length)) as VercelInstallMeta;
    return meta.via === "integration" && typeof meta.installationId === "string" && typeof meta.configurationId === "string" &&
      (meta.teamId === null || typeof meta.teamId === "string") ? meta : null;
  } catch { return null; }
}

export function integrationScopes(meta: VercelInstallMeta): string[] {
  return [...READ_SCOPES, `${PREFIX}${JSON.stringify(meta)}`];
}

/** Only an existing install may be upgraded. Pasted credentials must coexist. */
export function upgradeTarget(
  rows: Pick<Connection, "id" | "externalAccountId" | "scopes">[],
  externalAccountId: string,
  configurationId: string,
): string | null {
  const sameInstallation = rows.find((r) => readVercelInstallMeta(r.scopes)?.configurationId === configurationId);
  return sameInstallation?.id ?? rows.find((r) => r.externalAccountId === externalAccountId && readVercelInstallMeta(r.scopes))?.id ?? null;
}

/** Reuse legacy pasted rows, but never let a paste replace a legacy install. */
export function pastedAccountId(userAccountId: string, rows: Pick<Connection, "externalAccountId" | "scopes">[]): string {
  const pasted = `pasted:${userAccountId}`;
  if (rows.some((r) => r.externalAccountId === pasted)) return pasted;
  return rows.some((r) => r.externalAccountId === userAccountId && !readVercelInstallMeta(r.scopes)) ? userAccountId : pasted;
}

export async function saveVercelIntegration(input: {
  userId: string; externalAccountId: string; display: string; accessToken: string; proofProjectId: string | null; meta: VercelInstallMeta;
}) {
  const db = getDb();
  const rows = await db.select().from(schema.connections).where(and(
    eq(schema.connections.userId, input.userId), eq(schema.connections.provider, "vercel"),
  ));
  const id = upgradeTarget(rows, input.externalAccountId, input.meta.configurationId);
  const sealed = encrypt(input.accessToken);
  const values = {
    userId: input.userId,
    provider: "vercel" as const,
    externalAccountId: `integration:${input.meta.configurationId}`,
    display: input.display,
    scopes: integrationScopes(input.meta),
    status: "active" as const,
    statusReason: null,
    encryptedAccessToken: sealed.ciphertext,
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    keyId: sealed.keyId,
    revokedAt: null,
  };
  const [row] = id
    ? await db.update(schema.connections).set(values).where(eq(schema.connections.id, id)).returning()
    : await db.insert(schema.connections).values(values).onConflictDoUpdate({
      target: [schema.connections.userId, schema.connections.provider, schema.connections.externalAccountId], set: values,
    }).returning();
  await appendAudit({
    actor: `user:${input.userId}`, userId: input.userId, action: "connection.connected",
    target: `connection:${row.id}`,
    after: { provider: "vercel", via: "integration", display: row.display, scopes: READ_SCOPES, status: "active",
      installationId: input.meta.installationId, configurationId: input.meta.configurationId, teamId: input.meta.teamId },
  });
  return row;
}

export function retireDecision(input: { covers: boolean; readsElsewhere: boolean }): "retire" | "keep" {
  return input.covers && !input.readsElsewhere ? "retire" : "keep";
}

/** Prove coverage with the install's project, then check every other readable scope.
 * Unknown scopes and failed reads keep the pasted token. GET requests only. */
export async function tokenRetirementEvidence(
  token: string, installTeamId: string | null, installUserId: string, proofProjectId: string | null,
): Promise<{ covers: boolean; readsElsewhere: boolean }> {
  if (!proofProjectId) return { covers: false, readsElsewhere: false };
  try {
    await vercelGet(token, `/v10/projects/${encodeURIComponent(proofProjectId)}`, installTeamId ? { teamId: installTeamId } : {});
  } catch {
    return { covers: false, readsElsewhere: false };
  }
  try {
    const identity = await identifyToken(token);
    for (const scope of identity.scopes) {
      if ((scope.kind === "team" && scope.id === installTeamId) || (scope.kind === "user" && !installTeamId && scope.id === installUserId)) continue;
      // A scoped token has no account ID, so its other projects cannot be assigned to this install.
      if (scope.id === "scoped") return { covers: true, readsElsewhere: true };
      const result = await vercelGet<{ projects?: { id: string }[] }>(token, "/v10/projects", { ...teamQuery(scope), limit: 1 });
      if (!Array.isArray(result.projects)) return { covers: true, readsElsewhere: true };
      if (result.projects?.length) return { covers: true, readsElsewhere: true };
    }
    return { covers: true, readsElsewhere: false };
  } catch {
    return { covers: true, readsElsewhere: true };
  }
}

/** Replace only redundant pasted credentials. Jobs must be re-pointed before
 * the old token is wiped so the schedule watcher never reads a revoked row. */
export async function retireCoveredTokens(input: {
  userId: string; installRowId: string; installTeamId: string | null; installUserId: string; proofProjectId: string | null;
}): Promise<number> {
  if (!INTEGRATION_READS_REQUEST_HISTORY) return 0;
  if (!input.proofProjectId) return 0;
  const db = getDb();
  const rows = await db.select().from(schema.connections).where(and(
    eq(schema.connections.userId, input.userId), eq(schema.connections.provider, "vercel"), eq(schema.connections.status, "active"),
  ));
  const installedScope = input.installTeamId ? `team:${input.installTeamId}` : `user:${input.installUserId}`;
  // The install sync upserts the provider_account node at vercel:account:<scope id>,
  // replacing its connection_id attribute with the install row ID.
  let retired = 0;
  for (const row of rows) {
    if (row.id === input.installRowId || row.scopes.some((scope) => scope.startsWith(PREFIX)) || !row.encryptedAccessToken) continue;
    let token: string;
    try { token = decrypt(row.encryptedAccessToken); } catch { continue; }
    try {
      const evidence = await tokenRetirementEvidence(token, input.installTeamId, input.installUserId, input.proofProjectId);
      if (retireDecision(evidence) !== "retire") continue;
      await db.update(schema.checkinJobs).set({ vercelConnectionId: input.installRowId, updatedAt: new Date() }).where(and(
        eq(schema.checkinJobs.userId, input.userId), eq(schema.checkinJobs.source, "vercel"),
        eq(schema.checkinJobs.vercelConnectionId, row.id), eq(schema.checkinJobs.vercelScopeId, installedScope),
      ));
      await revokeConnection(row, `user:${input.userId}`, { reason: "replaced_by_vercel_integration", installRowId: input.installRowId });
      retired++;
    } catch (err) {
      console.error("[vercel install] token retirement failed", row.id, (err as Error).message);
    }
  }
  return retired;
}

/** The placeholder a connection carries until the account's own name has been read. */
export function isPlaceholderDisplay(display: string): boolean {
  return /^Vercel team team_/.test(display) || display === "Vercel personal account";
}

/**
 * The name a person would recognise for an install: the team's slug, or the username.
 * Null when the token may not read it; the caller keeps the placeholder. GET only.
 */
export async function installDisplayName(token: string, teamId: string | null): Promise<string | null> {
  try {
    if (teamId) {
      const t = await vercelGet<{ slug?: string; name?: string }>(token, `/v2/teams/${encodeURIComponent(teamId)}`, { teamId });
      return t.slug || t.name || null;
    }
    const u = await vercelGet<{ user?: { username?: string } }>(token, "/v2/user");
    return u.user?.username ?? null;
  } catch {
    return null;
  }
}
