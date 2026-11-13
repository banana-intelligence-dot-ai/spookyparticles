"use client";
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
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("failed");
    }
  };
  return (
    <div className="paste">
      <button type="button" onClick={copy} title={prompt} aria-label={`Copy this prompt for your coding agent: ${prompt}`} className="paste-pill">
        <span>Paste into your agent</span>
        <code aria-hidden>{prompt}</code>
        <kbd aria-live="polite">{status === "copied" ? "Copied" : status === "failed" ? "Blocked" : "Copy"}</kbd>
      </button>
      {status === "failed" ? (
        <p className="paste-fail" role="status">
          Your browser blocked copying. <a href="/setup.md">Open the setup page</a> and give it to your agent.
        </p>
      ) : null}
    </div>
  );
}
