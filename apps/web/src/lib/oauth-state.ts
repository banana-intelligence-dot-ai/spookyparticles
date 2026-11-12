/**
 * OAuth state for our own connection flows. The state, the PKCE verifier, the
 * signed-in user id and an expiry are sealed with the master key into one
 * httpOnly cookie. The callback accepts the code only if the cookie opens, the
 * state matches, the provider matches, and the same user is still signed in.
 */
import { createHash } from "node:crypto";
import { decrypt, encrypt, randomToken } from "./crypto";

export const OAUTH_COOKIE = "sp_connect_state";
const TTL_MS = 10 * 60 * 1000;

/** n: the in-app page to land on afterwards (already checked against an allowlist). */
type Payload = { p: string; u: string; s: string; v: string; e: number; n?: string };

export function createOAuthState(userId: string, provider: string, next?: string) {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const payload: Payload = { p: provider, u: userId, s: state, v: verifier, e: Date.now() + TTL_MS, ...(next ? { n: next } : {}) };
  return { state, challenge, cookieValue: encrypt(JSON.stringify(payload)).ciphertext };
}

export function verifyOAuthState(
  cookieValue: string | undefined,
  stateParam: string | null,
  userId: string,
  provider: string,
): { verifier: string; next?: string } | null {
  if (!cookieValue || !stateParam) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(decrypt(cookieValue));
  } catch {
    return null;
  }
  if (payload.p !== provider || payload.u !== userId || payload.s !== stateParam) return null;
  if (Date.now() > payload.e) return null;
  return { verifier: payload.v, next: payload.n };
}

export const oauthCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/connect",
  maxAge: TTL_MS / 1000,
};
