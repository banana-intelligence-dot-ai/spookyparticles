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
