"use client";
import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : `${label} ${value}`}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard blocked; nothing to do */
        }
      }}
      className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-raised-2 hover:text-fg sm:after:-inset-1"
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="size-3.5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" />
        </svg>
      )}
    </button>
  );
}
