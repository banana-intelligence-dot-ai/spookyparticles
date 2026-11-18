"use client";
/**
 * Product email consent: the Settings switch and the one-time ask on Now. Both read and write
 * /api/v1/me/marketing, the same call an agent makes (MCP: marketing_emails, set_marketing_emails).
 * Off unless the owner says yes. The ask shows only until the first answer of either kind.
 */
import { useState } from "react";
import { Switch, buttonStyles, surface } from "@/components/ui";
import { apiSend, useApi } from "@/components/use-api";
import type { MarketingState } from "@/lib/marketing";

const PATH = "/api/v1/me/marketing";

function useMarketing() {
  const state = useApi<MarketingState>(PATH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The saved answer, so a reload that fails afterwards can't bring the ask back.
  const [saved, setSaved] = useState<MarketingState | null>(null);
  const answer = async (optIn: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend<MarketingState>("PUT", PATH, { optIn });
      if (!r.ok) setError(r.error ?? "That didn't save. Try again.");
      else if (r.data) setSaved(r.data);
      await state.reload();
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return { data: saved ?? state.data, busy, error, answer };
}

export function MarketingToggle() {
  const m = useMarketing();
  if (!m.data) return null;
  const on = m.data.optedIn;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="max-w-[520px]">
        <p id="marketing-label" className="text-[14px] text-fg">Product emails</p>
        <p className="mt-1 text-[13px] leading-[1.55] text-pretty text-fg-2">
          Occasional emails about new features. Off unless you turn it on. Unsubscribe any time.
        </p>
        <p className="mt-1 truncate font-mono text-[13px] text-fg-3">{m.data.email}</p>
        {m.error ? <p className="mt-2 text-[13px] text-red">{m.error}</p> : null}
      </div>
      <Switch on={on} busy={m.busy} labelledBy="marketing-label" onFlip={() => void m.answer(!on)} />
    </div>
  );
}

/** The quiet one-time ask on Now. Gone for good after either answer. */
export function MarketingAsk() {
  const m = useMarketing();
  if (!m.data || m.data.answered) return null;
  return <MarketingAskCard email={m.data.email} busy={m.busy} error={m.error} onAnswer={(optIn) => void m.answer(optIn)} />;
}

/** Presentational, so the dev preview can draw it. */
export function MarketingAskCard({ email, busy, error, onAnswer }: { email: string; busy: boolean; error: string | null; onAnswer: (optIn: boolean) => void }) {
  return (
    <section aria-labelledby="marketing-ask-title" className={`${surface} mb-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4`}>
      <div className="min-w-0">
        <h2 id="marketing-ask-title" className="text-[14px] text-fg">Can we email you about new features?</h2>
        <p className="mt-1 truncate font-mono text-[13px] text-fg-3">{email}</p>
        {error ? <p className="mt-2 text-[13px] text-red">{error}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" className={buttonStyles.ghost} disabled={busy} onClick={() => onAnswer(false)}>
          No thanks
        </button>
        <button type="button" className={buttonStyles.secondary} disabled={busy} onClick={() => onAnswer(true)}>
          Yes, email me
        </button>
      </div>
    </section>
  );
}
