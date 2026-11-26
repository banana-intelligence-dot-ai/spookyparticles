"use client";
import { touch } from "@/lib/analytics/client";
import { useState } from "react";

/**
 * The second way in: one prompt the visitor pastes into their coding agent. The pill shows the
 * prompt it copies (truncated on wide screens, whole on phones). If the browser blocks the
 * clipboard, it says so and links the setup page the prompt points at.
 */
export function PastePrompt({ prompt }: { prompt: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      touch("setup_prompt_copied", { ok: false });
      setStatus("failed");
      return;
    }
    touch("setup_prompt_copied", { ok: true });
    setStatus("copied");
    setTimeout(() => setStatus("idle"), 1500);
  };
  return (
    <div className="paste">
      <button type="button" onClick={copy} title={prompt} aria-label={`Copy this prompt for your coding agent: ${prompt}`} className="paste-pill">
        <span>Copy for your agent</span>
        <code aria-hidden>{prompt}</code>
        <kbd aria-live="polite">{status === "copied" ? "Copied" : status === "failed" ? "Blocked" : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-label="Copy">
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" />
            </svg>
          )}</kbd>
      </button>
      {status === "failed" ? (
        <p className="paste-fail" role="status">
          Your browser blocked copying. <a href="/setup.md">Open the setup page</a> and give it to your agent.
        </p>
      ) : null}
    </div>
  );
}
