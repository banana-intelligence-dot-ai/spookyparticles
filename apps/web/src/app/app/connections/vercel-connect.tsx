"use client";
import { useState } from "react";
import { buttonStyles, surface } from "@/components/ui";
import { apiPost } from "@/components/use-api";

const INPUT =
  "h-11 w-full rounded-lg border border-line-2 bg-transparent px-3 font-mono text-[14px] text-fg hover:border-line-3 focus:border-line-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-9";

type Result = { connection: { id: string; display: string }; scopes: { kind: string; name: string }[] };

/**
 * Paste a Vercel token. The steps are exact because the page they lead to changes
 * rarely and the user does this once. The token goes to our server once, over
 * this one request, and is never shown again here.
 */
export function VercelConnect({ integrationEnabled = false, onConnected, onClose }: { integrationEnabled?: boolean; onConnected: () => Promise<void> | void; onClose: () => void }) {
  if (integrationEnabled) return (
    <section aria-label="Vercel installation" className={`${surface} mb-8 p-5 sm:p-6`}>
      <p className="max-w-[62ch] text-[14px] leading-[1.55] text-fg-2">Vercel sets what this can read, and you pick the projects. Schedules are listed; watching them needs a token or one check-in line.</p>
      <p className="mt-4 max-w-[62ch] text-[14px] leading-[1.55] text-fg-2">Adds schedule watching with no code change. Vercel cannot make a token read-only, so read-only is enforced in our code.</p>
      <VercelTokenForm onConnected={onConnected} />
    </section>
  );
  return <VercelTokenForm onConnected={onConnected} onClose={onClose} />;
}

function VercelTokenForm({ onConnected, onClose }: { onConnected: () => Promise<void> | void; onClose?: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await apiPost<Result>("/api/connect/vercel", { token: token.trim() });
    setBusy(false);
    setToken("");
    if (!r.ok || !r.data) {
      setError(r.error ?? "That did not connect. Try again.");
      return;
    }
    setDone(r.data);
    await onConnected();
  };

  return (
    <section aria-labelledby="vercel-connect" className={`${surface} mb-8 p-5 sm:p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="vercel-connect" className="text-[16px] font-medium text-fg">
            {onClose ? "Add a Vercel token" : "Add a read token"}
          </h2>
          <p className="mt-1 max-w-[62ch] text-[14px] leading-[1.55] text-pretty text-fg-2">
            Every project on your Vercel account or team, with its production URL, last deploy, recent failures and domains, including
            projects that never touched GitHub.
          </p>
        </div>
        {onClose ? <button type="button" className="-mt-1 inline-flex h-8 shrink-0 items-center rounded-lg px-2 text-[14px] text-fg-2 hover:text-fg" onClick={onClose}>Close</button> : null}
      </div>

      {done ? (
        <p role="status" className="mt-5 text-[14px] text-fg">
          Vercel connected as <span className="font-mono">{done.connection.display}</span>. Reading{" "}
          {done.scopes.length === 1 ? "1 scope" : `${done.scopes.length} scopes`} now; projects appear on the map as they are read.
        </p>
      ) : (
        <>
          <ol className="mt-5 grid gap-2.5 text-[14px] leading-[1.55] text-fg-2 [counter-reset:step]">
            {[
              <>
                Open{" "}
                <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="font-mono text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
                  vercel.com/account/tokens
                </a>
                . Make sure the top-left scope picker shows your personal account, not a team.
              </>,
              <>
                Name it <span className="font-mono text-fg">spooky particles</span>.
              </>,
              <>
                Under <span className="text-fg">Scope</span>, pick <span className="text-fg">Full Account</span> to map every team at once, or one team to limit it.
              </>,
              <>
                Set <span className="text-fg">Expiration</span> to 90 days. Click <span className="text-fg">Create</span>, then copy the token. Vercel shows it once.
              </>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3 [counter-increment:step]">
                <span aria-hidden className="w-4 shrink-0 font-mono text-fg-3 tabular-nums">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex-1">
              <span className="sr-only">Vercel token</span>
              <input
                id="vercel-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="vcp_…"
                className={INPUT}
              />
            </label>
            <button type="submit" className={buttonStyles.primary} disabled={busy || !token.trim()}>
              {busy ? "Checking…" : "Connect Vercel"}
            </button>
          </form>
          {error ? <p className="mt-3 text-[14px] text-amber">{error}</p> : null}

          <p className="mt-4 max-w-[66ch] text-[14px] leading-[1.55] text-pretty text-fg-2">
            Vercel tokens cannot be made read-only; they carry your role. So read-only is enforced on our side: the code that
            holds this token sends GET requests plus one read-only query of request history to see whether schedules ran, and it keeps projects, deployments and domains. Vercel includes
            environment variable values in its project response; they are dropped in memory and never stored or logged. The token
            is encrypted at rest. To revoke, delete it at Vercel; revoking here wipes our copy.
          </p>
        </>
      )}
    </section>
  );
}
