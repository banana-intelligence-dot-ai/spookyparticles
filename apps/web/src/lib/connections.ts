/**
 * Connections: create, read tokens, revoke. Token plaintext exists only in local
 * variables inside these functions and in outbound provider requests.
 *
 * Two shapes:
 * - Gmail: OAuth tokens, encrypted at rest.
 * - GitHub: a GitHub App installation. external_account_id is the installation
 *   id; no token is stored. Installation tokens are minted per use and cached in
 *   memory only (src/lib/providers/github-app.ts).
 */
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Connection, ConnectionProvider } from "@/db/schema";
import { appendAudit } from "./audit";
import { decrypt, encrypt, encryptOptional } from "./crypto";
import { refreshGoogleToken, revokeGoogleToken } from "./providers/google";
import { GithubApiError, deleteInstallation, installationToken } from "./providers/github-app";
import { syncEta } from "./sync-eta";

/** The public shape. Never includes token columns. */
export function publicConnection(c: Connection) {
  return {
    id: c.id,
    provider: c.provider,
    display: c.display,
    externalAccountId: c.externalAccountId,
    scopes: c.scopes.filter((scope) => !scope.startsWith("vercel-install:")),
    status: c.status,
    statusReason: c.statusReason,
    createdAt: c.createdAt,
    lastSyncedAt: c.lastSyncedAt,
    revokedAt: c.revokedAt,
  };
}

export async function saveConnection(input: {
  userId: string;
  provider: ConnectionProvider;
  externalAccountId: string;
  display: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  actor: string;
}): Promise<Connection> {
  const sealed = encrypt(input.accessToken);
  const values = {
    userId: input.userId,
    provider: input.provider,
    externalAccountId: input.externalAccountId,
    display: input.display,
    scopes: input.scopes,
    status: "active" as const,
    encryptedAccessToken: sealed.ciphertext,
    encryptedRefreshToken: encryptOptional(input.refreshToken),
    tokenExpiresAt: input.expiresInSeconds ? new Date(Date.now() + input.expiresInSeconds * 1000) : null,
    keyId: sealed.keyId,
    statusReason: null,
    revokedAt: null,
  };
  const [row] = await getDb()
    .insert(schema.connections)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.connections.userId, schema.connections.provider, schema.connections.externalAccountId],
      set: values,
    })
    .returning();
  await appendAudit({
    actor: input.actor,
    userId: input.userId,
    action: "connection.connected",
    target: `connection:${row.id}`,
    after: { provider: row.provider, display: row.display, scopes: row.scopes, status: row.status },
  });
  return row;
}

/**
 * A GitHub App installation as a connection. No token columns: they stay null.
 * Reconnecting the same installation reactivates the row.
 */
export async function saveInstallationConnection(input: {
  userId: string;
  installationId: string;
  display: string;
  scopes: string[];
  actor: string;
  status?: "active" | "errored";
  statusReason?: string | null;
}): Promise<Connection> {
  const values = {
    userId: input.userId,
    provider: "github" as const,
    externalAccountId: input.installationId,
    display: input.display,
    scopes: input.scopes,
    status: input.status ?? ("active" as const),
    statusReason: input.statusReason ?? null,
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    keyId: null,
    revokedAt: null,
  };
  const [row] = await getDb()
    .insert(schema.connections)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.connections.userId, schema.connections.provider, schema.connections.externalAccountId],
      set: values,
    })
    .returning();
  await appendAudit({
    actor: input.actor,
    userId: input.userId,
    action: "connection.connected",
    target: `connection:${row.id}`,
    after: { provider: row.provider, display: row.display, scopes: row.scopes, status: row.status, installationId: input.installationId },
  });
  return row;
}

export async function markConnectionErrored(c: Connection, reason: string, actor = "system:sync") {
  await getDb()
    .update(schema.connections)
    .set({ status: "errored", statusReason: reason.slice(0, 120) })
    .where(eq(schema.connections.id, c.id));
  await appendAudit({
    actor,
    userId: c.userId,
    action: "connection.errored",
    target: `connection:${c.id}`,
    before: { status: c.status },
    after: { status: "errored", reason: reason.slice(0, 120) },
  });
}

/** GitHub's answer when an installation token cannot be minted, in our words. */
export function installationProblem(err: unknown): string | null {
  if (!(err instanceof GithubApiError)) return null;
  if (err.status === 404) return "Installation removed on GitHub";
  if (err.status === 403 && /suspend/i.test(err.githubMessage ?? "")) return "Installation suspended on GitHub";
  if (err.status === 403) return "GitHub refused access to the installation";
  return null;
}

/**
 * An installation token for an active GitHub connection. When GitHub says the
 * installation is gone or suspended, the connection is marked errored with a
 * short reason and the error is rethrown.
 */
export async function getInstallationToken(connectionId: string): Promise<string> {
  const c = await getConnection(connectionId);
  if (!c || c.provider !== "github" || c.status !== "active") throw new Error("connection is not active");
  try {
    return await installationToken(c.externalAccountId);
  } catch (err) {
    const reason = installationProblem(err);
    if (reason) await markConnectionErrored(c, reason);
    throw err;
  }
}

export async function getConnection(id: string, userId?: string): Promise<Connection | null> {
  const where = userId
    ? and(eq(schema.connections.id, id), eq(schema.connections.userId, userId))
    : eq(schema.connections.id, id);
  const [row] = await getDb().select().from(schema.connections).where(where).limit(1);
  return row ?? null;
}

/**
 * A usable access token for an active connection, refreshing Google tokens that
 * expire within two minutes. Each call reads from the database, so workflow steps
 * pass only the connection id between them, never a token.
 */
export async function getAccessToken(connectionId: string): Promise<string> {
  const c = await getConnection(connectionId);
  if (c?.provider === "github") throw new Error("github connections use getInstallationToken");
  if (!c || c.status !== "active" || !c.encryptedAccessToken) throw new Error("connection is not active");
  const expiresSoon = c.tokenExpiresAt && c.tokenExpiresAt.getTime() < Date.now() + 120_000;
  if (c.provider === "gmail" && expiresSoon) {
    if (!c.encryptedRefreshToken) throw new Error("gmail connection has no refresh token");
    let fresh;
    try {
      fresh = await refreshGoogleToken(decrypt(c.encryptedRefreshToken));
    } catch (err) {
      if (/invalid_grant/.test((err as Error).message)) {
        // Revoked by the user, or expired: while the Google app is in Testing
        // status, refresh tokens last 7 days. Reconnecting replaces the row.
        await markConnectionErrored(c, "Google access expired. Reconnect this inbox.");
      }
      throw err;
    }
    const sealed = encrypt(fresh.access_token);
    await getDb()
      .update(schema.connections)
      .set({
        encryptedAccessToken: sealed.ciphertext,
        keyId: sealed.keyId,
        tokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000),
        ...(fresh.refresh_token ? { encryptedRefreshToken: encrypt(fresh.refresh_token).ciphertext } : {}),
      })
      .where(eq(schema.connections.id, c.id));
    return fresh.access_token;
  }
  return decrypt(c.encryptedAccessToken);
}

export type RevokeResult = { id: string; provider: ConnectionProvider; providerRevoked: boolean; providerStatus?: number };

/**
 * Revoke at the provider, then mark revoked and drop the ciphertext. If the
 * provider call fails we still mark the row revoked and wipe our copy, and record
 * the provider status so it can be retried by hand.
 */
export async function revokeConnection(c: Connection, actor: string, auditDetails?: { reason: string; installRowId: string }): Promise<RevokeResult> {
  let providerRevoked = false;
  let providerStatus: number | undefined;
  try {
    if (c.provider === "github") {
      if (c.encryptedAccessToken) {
        // A token from the retired OAuth-app flow. That revoke path is gone; the
        // user removes access in GitHub settings. Our copy is wiped below.
        providerStatus = 0;
      } else {
        // Uninstalls the app from that account. 404 means it was already removed.
        const r = await deleteInstallation(c.externalAccountId);
        providerRevoked = r.ok;
        providerStatus = r.status;
      }
    } else {
      // Google: revoking the refresh token also kills its access tokens.
      const encrypted = c.encryptedRefreshToken ?? c.encryptedAccessToken;
      if (encrypted) {
        const token = decrypt(encrypted);
        const r =
          c.provider === "gmail"
            ? await revokeGoogleToken(token)
            : // Paste-a-token providers: the user deletes the token in the provider console.
              { ok: false, status: 0 };
        providerRevoked = r.ok;
        providerStatus = r.status;
      }
    }
  } catch (err) {
    console.error("[revoke] provider call failed", c.provider, c.id, (err as Error).message);
  }

  const before = { status: c.status };
  await getDb()
    .update(schema.connections)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
    })
    .where(eq(schema.connections.id, c.id));

  await appendAudit({
    actor,
    userId: c.userId,
    action: "connection.revoked",
    target: `connection:${c.id}`,
    before,
    after: { status: "revoked", providerRevoked, providerStatus: providerStatus ?? null, ...auditDetails },
  });
  return { id: c.id, provider: c.provider, providerRevoked, providerStatus };
}

export async function listConnectionsWithSync(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.connections)
    .where(eq(schema.connections.userId, userId))
    .orderBy(desc(schema.connections.createdAt));
  const ids = rows.map((r) => r.id);
  const runs = ids.length
    ? await db
        .select()
        .from(schema.syncRuns)
        .where(inArray(schema.syncRuns.connectionId, ids))
        .orderBy(desc(schema.syncRuns.startedAt))
    : [];
  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.connectionId)) latest.set(r.connectionId, r);

  // Reading progress per inbox: candidates read over candidates found.
  const reading = new Map<string, { done: number; total: number }>();
  const gmailIds = rows.filter((r) => r.provider === "gmail").map((r) => r.id);
  if (gmailIds.length) {
    const counts = await db
      .select({
        connectionId: schema.messages.connectionId,
        total: count(),
        done: sql<number>`count(*) filter (where ${schema.messages.readAt} is not null)::int`,
      })
      .from(schema.messages)
      .where(inArray(schema.messages.connectionId, gmailIds))
      .groupBy(schema.messages.connectionId);
    for (const r of counts) reading.set(r.connectionId, { done: Number(r.done), total: Number(r.total) });
  }

  return rows.map((c) => {
    const run = latest.get(c.id);
    return {
      ...publicConnection(c),
      sync: run
        ? {
            // Reading progress: billing candidates read over candidates found (Gmail only).
            reading: c.provider === "gmail" ? (reading.get(c.id) ?? { done: 0, total: 0 }) : null,
            id: run.id,
            phase: run.phase,
            scanned: run.scanned,
            candidates: run.candidates,
            error: run.error,
            paused: Boolean(run.cursor && run.finishedAt && run.phase !== "done"),
            startedAt: run.startedAt,
            updatedAt: run.updatedAt,
            finishedAt: run.finishedAt,
            // Null until the run knows its total, and again once it has passed the estimate.
            totalEstimate: run.totalEstimate !== null && run.scanned < run.totalEstimate ? run.totalEstimate : null,
            // remaining, etaSeconds, percent follow the same rule.
            ...syncEta(run),
          }
        : null,
    };
  });
}
