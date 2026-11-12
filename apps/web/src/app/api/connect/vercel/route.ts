/**
 * POST /api/connect/vercel: the user pastes a Vercel access token.
 *
 * Session only. An agent key cannot call this: the human makes the token and
 * pastes it, so no agent ever holds it. The token is checked against Vercel
 * with GET requests only, sealed with the master key, and the first inventory
 * starts. The token value appears in no log, no audit row and no response.
 */
import { track } from "@/lib/analytics/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sessionUserId } from "@/lib/connect";
import { saveConnection } from "@/lib/connections";
import { ApiError, api, json } from "@/lib/http";
import { VercelApiError, VercelNoReadableScope, identifyToken, looksLikeVercelToken, scopesOf } from "@/lib/providers/vercel";
import { startSync } from "@/lib/sync";
import { pastedAccountId } from "@/lib/vercel-integration";

/** Vercel has no read-only token; our client enforces GET plus one read-only request-history query. */
const VERCEL_SCOPES = ["projects:read", "deployments:read", "domains:read"];

export const POST = api(async (req) => {
  const userId = await sessionUserId(req);
  if (!userId) throw new ApiError(401, "unauthorized", "Sign in first");
  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    throw new ApiError(400, "bad_request", "Send JSON with a token field");
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!looksLikeVercelToken(token)) throw new ApiError(400, "token_shape", "That does not look like a Vercel token. Paste the value shown once when you created it.");

  let identity;
  try {
    identity = await identifyToken(token);
  } catch (err) {
    if (err instanceof VercelNoReadableScope) {
      throw new ApiError(400, "token_scope", "Vercel accepted the token but it reads no account or team. Make one with Full Account or a team scope.");
    }
    if (err instanceof VercelApiError && (err.status === 401 || err.status === 403)) {
      throw new ApiError(400, "token_rejected", "Vercel did not accept that token. Check it was copied whole and has not expired.");
    }
    if (err instanceof VercelApiError && err.retryAfterMs !== null) throw new ApiError(503, "vercel_busy", "Vercel is rate limiting. Try again in a minute.");
    throw err;
  }
  const scopes = scopesOf(identity);
  const display = identity.scoped ? "Scoped token" : scopes.map((s) => s.slug).join(", ");
  // Reuse pasted full-account credentials without overwriting a legacy integration row.
  const existing = identity.user ? await getDb().select({ externalAccountId: schema.connections.externalAccountId, scopes: schema.connections.scopes }).from(schema.connections).where(and(
    eq(schema.connections.userId, userId), eq(schema.connections.provider, "vercel"),
  )) : [];
  const externalAccountId = identity.user ? pastedAccountId(`user:${identity.user.id}`, existing) : `scoped:${Date.now()}`;

  const c = await saveConnection({
    userId,
    provider: "vercel",
    externalAccountId,
    display,
    scopes: VERCEL_SCOPES,
    accessToken: token,
    actor: `user:${userId}`,
  });
  await track(userId, "consent_granted", { provider: "vercel", connection_id: c.id });
  const sync = await startSync(c, `user:${userId}`).catch(() => null);
  return json({
    connection: { id: c.id, provider: c.provider, display: c.display, status: c.status },
    scopes: scopes.map((s) => ({ kind: s.kind, name: s.name })),
    sync,
  });
});
