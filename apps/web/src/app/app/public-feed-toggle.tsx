"use client";
/**
 * The homepage fix feed switch. On for new accounts, off for accounts from before the policy said
 * so. Shows exactly what a shared row looks like, so nobody guesses what leaves the account.
 */
import { useState } from "react";
import { Switch } from "@/components/ui";
import { apiPost, useApi } from "@/components/use-api";

export function PublicFeedToggle() {
  const state = useApi<{ on: boolean }>("/api/v1/public-feed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state.data) return null;
  const on = state.data.on;

  const flip = async () => {
    setBusy(true);
    setError(null);
    const r = await apiPost<{ on: boolean }>("/api/v1/public-feed", { on: !on });
    setBusy(false);
    if (!r.ok) setError(r.error ?? "That didn't save. Try again.");
    await state.reload();
  };

  return <PublicFeedSwitch on={on} busy={busy} error={error} onFlip={() => void flip()} />;
}

/** Presentational, so the dev preview draws it against fixtures. */
export function PublicFeedSwitch({ on, busy, error, onFlip }: { on: boolean; busy: boolean; error: string | null; onFlip: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="max-w-[520px]">
        <p id="feed-label" className="text-[14px] text-fg">Show my fixes on the homepage</p>
        <p className="mt-1 text-[13px] leading-[1.55] text-pretty text-fg-2">
          Anonymous. Each row is only a time, the kind of break and how long the fix took, like{" "}
          <span className="font-mono text-fg">Nov 14 · 10:09 · Deploy failed · 10 min</span>. Never a project, repo, name or error. Turn it off any time.
        </p>
        {error ? <p className="mt-2 text-[13px] text-red">{error}</p> : null}
      </div>
      <Switch on={on} busy={busy} labelledBy="feed-label" onFlip={onFlip} />
    </div>
  );
}
