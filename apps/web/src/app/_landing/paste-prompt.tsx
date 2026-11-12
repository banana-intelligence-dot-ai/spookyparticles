"use client";
import { useState } from "react";

/** The second way in: one prompt the visitor pastes into their coding agent. The whole pill copies it. */
export function PastePrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the prompt is also at /setup.md */
    }
  };
  return (
    <button type="button" onClick={copy} title={prompt} className="paste-pill">
      <span>Or paste one prompt into your agent</span>
      <kbd aria-live="polite">{copied ? "Copied" : "Copy"}</kbd>
    </button>
  );
}
