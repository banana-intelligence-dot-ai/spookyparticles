/**
 * Better Auth sends a failed social sign-in back with ?error=<code>. Two codes matter here:
 * signup_disabled (GitHub or Google with no account behind it) and account_not_linked
 * (Vercel sign-in whose email already belongs to an account made another way; sign-in
 * never links accounts by itself).
 */
export function signInErrorMessage(error: string | null): string | null {
  if (error === "signup_disabled") return "No account uses that sign-in. New accounts start with Continue with Vercel.";
  if (error === "account_not_linked") return "An account already uses that email. Sign in the way you did before, then add Vercel on Connections.";
  return null;
}

/** Where /link sends a signed-out visitor back to after sign-in. Only a code-shaped value survives. */
export function linkReturnTo(code: string | null): string {
  const c = (code ?? "").trim();
  return /^[A-Za-z0-9-]{1,12}$/.test(c) ? `/link?code=${c}` : "/link";
}

/**
 * The sign-in buttons' returnTo, from the query string. An allowlist, never an open redirect:
 * the Vercel connect callback, or the agent approve page with a code-shaped value.
 */
export function safeReturnTo(value: string | null): string | null {
  if (value === "/api/connect/vercel/callback") return value;
  if (value === "/link" || (value && /^\/link\?code=[A-Za-z0-9-]{1,12}$/.test(value))) return value;
  return null;
}
