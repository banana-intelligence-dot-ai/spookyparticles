"use client";
import { useSearchParams } from "next/navigation";
import { signInErrorMessage } from "@/lib/sign-in-notice";

/**
 * Shown when a session is required or Better Auth blocks a new social sign-up.
 */
export function SignInNotice() {
  const params = useSearchParams();
  const message = signInErrorMessage(params.get("error"));
  const required = params.get("signin") === "required";
  if (!message && !required) return null;
  return (
    <div role="status" className="slab mb-6 flex max-w-[56ch] gap-3 rounded-2xl px-4 py-3">
      <span aria-hidden className="mt-[9px] size-2 shrink-0 rounded-full bg-amber" />
      <div>
        {message ? (
          <p className="text-[16px] text-fg">{message}</p>
        ) : (
          <>
            <p className="text-[16px] text-fg">Sign in to open that page.</p>
            <p className="mt-0.5 text-[14px] text-pretty text-fg-2">Sign in with Vercel. If you signed up before November 10, your GitHub or Google sign-in still works.</p>
          </>
        )}
      </div>
    </div>
  );
}
