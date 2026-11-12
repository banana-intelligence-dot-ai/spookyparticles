"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui";
import { touch } from "@/lib/analytics/client";
import { authClient } from "@/lib/auth-client";

type Provider = "github" | "google" | "vercel";

/** Which button was used last time on this browser. Only the provider word; never an address. */
const LAST = "sp:last-sign-in";
function readLast(): Provider | null {
  try {
    const v = window.localStorage.getItem(LAST);
    return v === "github" || v === "google" || v === "vercel" ? v : null;
  } catch {
    return null;
  }
}
function writeLast(p: Provider) {
  try {
    window.localStorage.setItem(LAST, p);
  } catch {
    /* storage blocked: the label just won't show next time */
  }
}

/**
 * `large` is the landing page’s 44px buttons; elsewhere the app's 32px controls. `inline` lets the
 * buttons join the parent's flex row, with the older-accounts link and errors on a line of their own.
 */
export function SignIn({ large = false, ink = false, inline = false, vercelEnabled = false }: { large?: boolean; ink?: boolean; inline?: boolean; vercelEnabled?: boolean }) {
  const ownLine = inline ? " order-last basis-full text-center max-[820px]:text-left" : "";
  const size = large ? " max-sm:w-full sm:h-11! sm:px-5! sm:text-[15px]!" : "";
  const primary = ink ? buttonStyles.ink : buttonStyles.primary;
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Provider | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [returnTo, setReturnTo] = useState("/app");
  useEffect(() => {
    setLast(readLast());
    const value = new URLSearchParams(window.location.search).get("returnTo");
    if (value === "/api/connect/vercel/callback") setReturnTo(value);
  }, []);
  // Once per visit after sign-in: ties this visit's link tag to the account, server side.
  useEffect(() => {
    if (isPending || !session) return;
    try {
      if (window.sessionStorage.getItem("sp.signed_in")) return;
      window.sessionStorage.setItem("sp.signed_in", "1");
    } catch {
      /* fine */
    }
    touch("signed_in", { provider: readLast() });
  }, [isPending, session]);

  if (!isPending && session) {
    return (
      <Link href={returnTo} className={primary + size}>
        Open Spooky Particles
      </Link>
    );
  }

  const go = async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    writeLast(provider);
    touch("signin_clicked", { provider });
    const r = await authClient.signIn.social({
      provider,
      callbackURL: returnTo,
      ...(vercelEnabled ? { errorCallbackURL: "/" } : {}),
    });
    if (r?.error) setError("Sign-in didn't start. Try again.");
    setBusy(null);
  };

  return (
    <div className={inline ? "contents" : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        {vercelEnabled ? (
          <button type="button" className={primary + size} disabled={busy !== null} onClick={() => go("vercel")}>
            <VercelMark />
            {busy === "vercel" ? "Redirecting…" : "Continue with Vercel"}
            {last === "vercel" && busy !== "vercel" ? <span className="font-normal opacity-70">· last time</span> : null}
          </button>
        ) : null}
        {!vercelEnabled || showOlder ? <button type="button" className={(vercelEnabled ? buttonStyles.secondary : primary) + size} disabled={busy !== null} onClick={() => go("github")}>
          <GitHubMark />
          {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
          {last === "github" && busy !== "github" ? <span className="font-normal opacity-70">· last time</span> : null}
        </button> : null}
        {!vercelEnabled || showOlder ? <button type="button" className={buttonStyles.secondary + size} disabled={busy !== null} onClick={() => go("google")}>
          <GoogleMark />
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
          {last === "google" && busy !== "google" ? <span className="font-normal text-fg-2">· last time</span> : null}
        </button> : null}
      </div>
      {vercelEnabled && !showOlder ? (
        <button type="button" className={"mt-3 text-[14px] text-fg-2 underline underline-offset-2 hover:text-fg" + ownLine} onClick={() => setShowOlder(true)}>
          Signed up before November 10? Use GitHub or Google
        </button>
      ) : null}
      {error ? <p className={"mt-3 text-[14px] text-red" + ownLine}>{error}</p> : null}
    </div>
  );
}

function VercelMark() {
  return <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden><path d="M8 1 16 15H0L8 1Z" /></svg>;
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Google's "G" in its own colors, as its sign-in branding guidelines require. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
