/**
 * Shared shape of our own connection flows (not the sign-in flow):
 * start: require a session, seal state (+ PKCE verifier) into a cookie, redirect.
 * return: verify the cookie against the same session, finish with the provider,
 * start the first sync, land back in the app.
 *
 * Gmail uses the OAuth code flow below. GitHub uses a GitHub App installation
 * (src/lib/github-connect.ts) and shares the state cookie and helpers.
 */
import { NextResponse, connection } from "next/server";
import { getAuth } from "./auth";
import { appUrl } from "./env";
import { OAUTH_COOKIE, createOAuthState, oauthCookieOptions, verifyOAuthState } from "./oauth-state";
import { track } from "./analytics/server";
import { saveConnection } from "./connections";
import { linkSignInIdentity, type ProvenIdentity } from "./identity";
import { startSync } from "./sync";

export type ConnectProvider = "gmail" | "github";

/** In-app pages a connect flow may return to. Anything else falls back to the first. */
const NEXT_PAGES = ["/app/connections", "/app"] as const;

export function safeNext(value: string | null | undefined): string {
  return NEXT_PAGES.find((p) => p === value) ?? NEXT_PAGES[0];
}

export function callbackUrl(provider: "gmail") {
  return `${appUrl()}/api/connect/${provider}/callback`;
}

export async function sessionUserId(req: Request): Promise<string | null> {
  // Request time only; these routes must never be prerendered.
  await connection();
  const s = await getAuth().api.getSession({ headers: req.headers });
  return s?.user.id ?? null;
}

export function appRedirect(path: string, params: Record<string, string>) {
  const u = new URL(path, appUrl());
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = NextResponse.redirect(u);
  res.cookies.delete({ name: OAUTH_COOKIE, path: oauthCookieOptions.path });
  return res;
}

export function signInRedirect() {
  return NextResponse.redirect(new URL("/?signin=required", appUrl()));
}

export function readStateCookie(req: Request): string | undefined {
  const raw = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${OAUTH_COOKIE}=`))
    ?.slice(OAUTH_COOKIE.length + 1);
  return raw ? decodeURIComponent(raw) : undefined;
}

/** Seal state for this user and provider, set the cookie, redirect to the provider. */
export async function redirectWithState(
  req: Request,
  provider: ConnectProvider,
  target: (o: { state: string; challenge: string }) => string,
) {
  const userId = await sessionUserId(req);
  if (!userId) return signInRedirect();
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const { state, challenge, cookieValue } = createOAuthState(userId, provider, next);
  const res = NextResponse.redirect(target({ state, challenge }));
  res.cookies.set(OAUTH_COOKIE, cookieValue, oauthCookieOptions);
  await track(userId, "consent_screen_shown", { provider });
  return res;
}

export async function beginConnect(
  req: Request,
  provider: "gmail",
  authorizeUrl: (o: { redirectUri: string; state: string; challenge: string }) => string,
) {
  return redirectWithState(req, provider, ({ state, challenge }) =>
    authorizeUrl({ redirectUri: callbackUrl(provider), state, challenge }),
  );
}

export type ExchangedIdentity = {
  externalAccountId: string;
  display: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
  /** The provider identity this exchange proved, to register as a sign-in for the same account. */
  identity?: ProvenIdentity | null;
};

export async function finishConnect(
  req: Request,
  provider: "gmail",
  exchange: (code: string, redirectUri: string, verifier: string) => Promise<ExchangedIdentity>,
) {
  const url = new URL(req.url);
  const userId = await sessionUserId(req);
  if (!userId) return signInRedirect();

  const verified = verifyOAuthState(readStateCookie(req), url.searchParams.get("state"), userId, provider);
  const next = safeNext(verified?.next);
  const fail = (code: string) => appRedirect(next, { error: code, provider });

  const providerError = url.searchParams.get("error");
  if (providerError) {
    await track(userId, "consent_abandoned", { provider, reason: providerError.slice(0, 64) });
    return fail(providerError === "access_denied" ? "consent_declined" : "provider_error");
  }

  const code = url.searchParams.get("code");
  if (!verified || !code) return fail("state_mismatch");

  let identity: ExchangedIdentity;
  try {
    identity = await exchange(code, callbackUrl(provider), verified.verifier);
  } catch (err) {
    console.error("[connect] exchange failed", provider, (err as Error).message);
    return fail("exchange_failed");
  }

  const { identity: proven, ...conn } = identity;
  const connection = await saveConnection({ userId, provider, ...conn, actor: `user:${userId}` });
  await track(userId, "consent_granted", { provider, connection_id: connection.id });

  // One person, one account: the Google account that owns this inbox now signs in here too.
  let identityNote: string | null = null;
  if (proven) {
    try {
      const r = await linkSignInIdentity(userId, proven, `user:${userId}`);
      if (r === "belongs_to_other_account") identityNote = "other_account";
    } catch (err) {
      console.error("[connect] identity link failed", (err as Error).message);
    }
  }

  try {
    await startSync(connection, `user:${userId}`);
  } catch (err) {
    // The connection is saved; the user can start the sync from the page.
    console.error("[connect] first sync did not start", provider, connection.id, (err as Error).message);
  }

  return appRedirect(next, identityNote ? { connected: provider, identity: identityNote } : { connected: provider });
}
