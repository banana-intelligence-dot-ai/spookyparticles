"use client";
/**
 * "Copy for my agent": puts the words for a coding agent on the clipboard. If the browser
 * refuses, the words show in a box to copy by hand. Extra actions (Ignore, Dismiss) sit beside it.
 * It is a secondary action: breaks already reach agents on their own, so the status line above it
 * leads. A `status` line, when given, says where the item stands with the owner's agents.
 */
import { useState, type ReactNode } from "react";

export const agentButton = "inline-flex h-11 items-center rounded-lg px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:h-9";

/** One line: where this item stands with the owner's agents. Sent ones carry the accent dot. */
export function RoutingLine({ text, sent }: { text: string; sent: boolean }) {
  return (
    <p className="flex items-start gap-2 text-[14px] leading-[1.45] text-fg">
      <span aria-hidden className={`mt-[7px] size-1.5 shrink-0 rounded-full ${sent ? "bg-accent" : "ring-1 ring-inset ring-fg-3"}`} />
      <span>{text}</span>
    </p>
  );
}

export function CopyForAgent({ prompt, children, className = "", label = "Copy for my agent" }: { prompt: string; children?: ReactNode; className?: string; label?: string }) {
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
        <button type="button" onClick={() => void copy()} className={`${agentButton} text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg hover:decoration-fg`}>
          {copied === "done" ? "Copied" : label}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied === "done" ? "Copied. Paste it to your agent." : ""}
        </span>
        {children}
      </div>
      {copied === "failed" ? (
        <textarea readOnly value={prompt} aria-label="Words for your agent" className="mt-2 h-40 w-full rounded-lg border border-line-2 bg-raised p-3 font-mono text-[12px] text-fg-2" onFocus={(e) => e.currentTarget.select()} />
      ) : null}
    </div>
  );
}
