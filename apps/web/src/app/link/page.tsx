import type { Metadata } from "next";
import { Suspense } from "react";
import { Footer, Wordmark } from "@/components/brand";
import { LinkApprove } from "./link-approve";

/** Signed-in only, and one-off: not a search page. */
export const metadata: Metadata = {
  title: "Approve an agent",
  robots: { index: false, follow: false },
};

/**
 * Agent sign-in, the human's half. A coding agent's setup script printed a code and this link;
 * the signed-in human checks the code, sees which agent says it is asking, and approves or denies.
 * The proxy sends a signed-out visitor to sign in and back here with the code.
 */
export default function LinkPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-8">
      <header className="flex h-16 items-center">
        <Wordmark href="/app" />
      </header>
      <main className="flex flex-1 flex-col justify-center py-16">
        <div className="w-full max-w-[34rem]">
          <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
            <LinkApprove />
          </Suspense>
        </div>
      </main>
      <footer className="flex h-16 items-center border-t border-line-1">
        <Footer />
      </footer>
    </div>
  );
}
