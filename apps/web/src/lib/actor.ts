/**
 * One helper resolves who is calling the API: a browser session cookie or an
 * `Authorization: Bearer sp_...` API key. Every /api/v1 route calls requireActor().
 * The web app has no other path to data.
 */
import { ApiError } from "./http";
import { sha256Hex } from "./crypto";
import type { ApiKeyScope } from "@/db/schema";

export type Actor = {
  userId: string;
  via: "session" | "api_key";
  scopes: ApiKeyScope[];
  apiKeyId?: string;
  /** Stable string for the audit log. */
  label: string;
};

export type ActorDeps = {
  getSessionUserId: (headers: Headers) => Promise<string | null>;
  findApiKeyByHash: (
    hash: string,
  ) => Promise<{ id: string; userId: string; scopes: ApiKeyScope[]; revokedAt: Date | null; expiresAt: Date | null } | null>;
  touchApiKey: (id: string) => Promise<void>;
};

export const API_KEY_PREFIX = "sp_";
const ALL_SCOPES: ApiKeyScope[] = ["read", "write", "approve"];

export function isKeyUsable(row: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()): boolean {
  return !row.revokedAt && (!row.expiresAt || row.expiresAt.getTime() > now.getTime());
}

export function createRequireActor(deps: ActorDeps) {
  return async function requireActor(req: Request, scope: ApiKeyScope = "read"): Promise<Actor> {
    const authz = req.headers.get("authorization");
    if (authz) {
      const m = /^Bearer\s+(\S+)$/i.exec(authz.trim());
      if (!m || !m[1].startsWith(API_KEY_PREFIX)) {
        throw new ApiError(401, "invalid_api_key", "Expected Authorization: Bearer sp_...");
      }
      const row = await deps.findApiKeyByHash(sha256Hex(m[1]));
      if (!row || !isKeyUsable(row)) throw new ApiError(401, "invalid_api_key", "Unknown, revoked or expired API key");
      if (!row.scopes.includes(scope)) {
        throw new ApiError(403, "insufficient_scope", `This key lacks the "${scope}" scope`);
      }
      // Best effort; a failed touch must not fail the request.
      await deps.touchApiKey(row.id).catch(() => undefined);
      return {
        userId: row.userId,
        via: "api_key",
        scopes: row.scopes,
        apiKeyId: row.id,
        label: `api_key:${row.id}`,
      };
    }

    const userId = await deps.getSessionUserId(req.headers);
    if (!userId) throw new ApiError(401, "unauthenticated", "Sign in or send an API key");
    return { userId, via: "session", scopes: ALL_SCOPES, label: `user:${userId}` };
  };
}
