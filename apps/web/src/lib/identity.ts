/**
 * One person, one account, many identities.
 *
 * The problem: someone connects four Google inboxes, comes back a month later,
 * signs in with whichever Google account is open, and gets a fresh empty
 * account. The fix: connecting an inbox proves control of that Google account,
 * so we also register it as a sign-in identity for the account that connected
 * it. Better Auth looks sign-ins up by (provider, provider account id), so the
 * next "Continue with Google" with that account lands in the same place.
 *
 * Only identities proven by an OAuth exchange we performed are linked. If the
 * identity already signs in to a different account, we leave it alone and
 * report it: that is the "two accounts" case, which gets a merge flow later.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "./audit";
import { getAuth } from "./auth";
import { userLogin } from "./providers/github-app";

export type ProvenIdentity = { provider: "google" | "github"; accountId: string; email: string | null };

export type LinkResult = "linked" | "already_linked" | "belongs_to_other_account" | "invalid";

/** Decode a Google id_token's payload without a network call. It came to us straight from Google's token endpoint over TLS in exchange for our code, so the claims are trusted after an audience and issuer check. */
export function identityFromGoogleIdToken(idToken: string | undefined, clientId: string): ProvenIdentity | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      iss?: string;
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: boolean;
      exp?: number;
    };
    if (payload.aud !== clientId) return null;
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return null;
    if (!payload.sub) return null;
    if (payload.exp && payload.exp * 1000 < Date.now() - 300_000) return null;
    return { provider: "google", accountId: payload.sub, email: payload.email_verified ? (payload.email ?? null) : null };
  } catch {
    return null;
  }
}

export async function linkSignInIdentity(userId: string, identity: ProvenIdentity, actor: string): Promise<LinkResult> {
  if (!identity.accountId) return "invalid";
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.account.id, userId: schema.account.userId })
    .from(schema.account)
    .where(and(eq(schema.account.providerId, identity.provider), eq(schema.account.accountId, identity.accountId)))
    .limit(1);
  if (existing) return existing.userId === userId ? "already_linked" : "belongs_to_other_account";

  // No tokens stored: this row exists so sign-in resolves to this user. Sign-in
  // itself always goes through the provider again.
  await db.insert(schema.account).values({
    id: crypto.randomUUID(),
    userId,
    providerId: identity.provider,
    accountId: identity.accountId,
    scope: "openid email",
    label: identity.email,
  });
  await appendAudit({
    actor,
    userId,
    action: "identity.linked",
    target: `${identity.provider}:${identity.accountId}`,
    after: { provider: identity.provider, email: identity.email },
  });
  return "linked";
}

/**
 * The sign-in identities on an account, for the "Ways to sign in" list. A GitHub
 * row made by Better Auth has no label; the first listing asks GitHub for the
 * login with the user's own token and keeps it, so the row reads "n8peace" and
 * not "GitHub account ···3231". Google rows are labeled when linked.
 */
export async function listSignInIdentities(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: schema.account.id, providerId: schema.account.providerId, accountId: schema.account.accountId, label: schema.account.label, createdAt: schema.account.createdAt })
    .from(schema.account)
    .where(eq(schema.account.userId, userId));
  for (const r of rows) {
    if (r.label || r.providerId !== "github") continue;
    try {
      const t = await getAuth().api.getAccessToken({ body: { accountId: r.id, userId } });
      const login = t?.accessToken ? await userLogin(t.accessToken) : null;
      if (!login) continue;
      await db.update(schema.account).set({ label: login }).where(eq(schema.account.id, r.id));
      r.label = login;
    } catch (err) {
      console.error("[identity] github label lookup failed", (err as Error).message);
    }
  }
  return rows;
}
