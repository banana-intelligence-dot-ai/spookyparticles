import { decrypt, encrypt } from "./crypto";

const PENDING_COOKIE = "sp_vercel_install_pending";
const PENDING_MS = 25 * 60_000;
export { PENDING_COOKIE };

export const pendingCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/connect/vercel/callback",
  maxAge: PENDING_MS / 1000,
};

export function safeVercelNext(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "vercel.com" || url.hostname.endsWith(".vercel.com")) && !url.username && !url.password
      ? url.toString() : null;
  } catch { return null; }
}

/** Carry Vercel's one-use code through sign-in without putting it in a URL. */
export function createPendingInstall(query: string, now = Date.now()): string {
  return encrypt(JSON.stringify({ q: query, e: now + PENDING_MS })).ciphertext;
}

export function verifyPendingInstall(cookie: string | undefined, now = Date.now()): string | null {
  if (!cookie) return null;
  try {
    const value = JSON.parse(decrypt(cookie)) as { q?: unknown; e?: unknown };
    return typeof value.q === "string" && value.q.length < 4096 && typeof value.e === "number" && now <= value.e ? value.q : null;
  } catch { return null; }
}
