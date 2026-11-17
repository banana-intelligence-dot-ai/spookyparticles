"use client";
import { useState } from "react";

/** Copy button for a code block. The tap target is 44px square. */
export function CopyCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy code"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked; nothing to do */
        }
      }}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 text-fg-2 transition-colors hover:text-fg"
    >
      {copied ? (
        <>
          <svg viewBox="0 0 16 16" className="size-3.5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 8.5 6.5 12 13 4.5" /></svg>
          <span aria-live="polite">Copied</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" />
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
