"use client";
/**
 * "Copy for my agent": puts the words for a coding agent on the clipboard. If the browser
 * refuses, the words show in a box to copy by hand. Extra actions (Ignore, Dismiss) sit beside it.
 */
import { useState, type ReactNode } from "react";

export const agentButton = "inline-flex h-11 items-center rounded-lg px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:h-9";

export function CopyForAgent({ prompt, children, className = "" }: { prompt: string; children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied("done");
      setTimeout(() => setCopied("idle"), 2500);
    } catch {
      setCopied("failed");
    }
  };
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy()} className={`${agentButton} border border-line-3 bg-raised-2 text-fg hover:bg-raised-2/70`}>
          {copied === "done" ? "Copied. Paste it to your agent" : "Copy for my agent"}
        </button>
        {children}
      </div>
      {copied === "failed" ? (
        <textarea readOnly value={prompt} aria-label="Words for your agent" className="mt-2 h-40 w-full rounded-lg border border-line-2 bg-raised p-3 font-mono text-[12px] text-fg-2" onFocus={(e) => e.currentTarget.select()} />
      ) : null}
    </div>
  );
}
