/**
 * Gmail connection: Google OAuth with gmail.readonly only. Tokens go straight to
 * the encrypted connections row; nothing here logs them.
 */
import { requireEnv } from "../env";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
/** openid and email ride along so the token response carries an id_token: that is how a connected inbox also becomes a sign-in identity (src/lib/identity.ts). */
export const CONNECT_SCOPES = `openid email ${GMAIL_SCOPE}`;

export function googleAuthorizeUrl(opts: { redirectUri: string; state: string; challenge: string }) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", CONNECT_SCOPES);
  u.searchParams.set("access_type", "offline");
  // consent: always return a refresh token. select_account: the chooser, so a
  // user can connect several Google accounts one after another.
  u.searchParams.set("prompt", "consent select_account");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  /** Present when openid was granted. Decoded in src/lib/identity.ts, never stored. */
  id_token?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      ...body,
    }),
  });
  if (!res.ok) {
    // Status and error code only; the response may echo request details.
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`google token endpoint ${res.status} ${err.error ?? ""}`.trim());
  }
  return (await res.json()) as GoogleTokens;
}

export function exchangeGoogleCode(code: string, redirectUri: string, verifier: string) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier });
}

export function refreshGoogleToken(refreshToken: string) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

/** The mailbox address, using only gmail.readonly (no profile scope needed). */
export async function gmailProfile(accessToken: string): Promise<{ emailAddress: string; messagesTotal: number }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`gmail profile ${res.status}`);
  return (await res.json()) as { emailAddress: string; messagesTotal: number };
}

/** Revoke at Google. Token in the form body, never in the URL. */
export async function revokeGoogleToken(token: string): Promise<{ ok: boolean; status: number }> {
  const res = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  // 400 invalid_token means it is already dead, which is the outcome we want.
  return { ok: res.ok || res.status === 400, status: res.status };
}
