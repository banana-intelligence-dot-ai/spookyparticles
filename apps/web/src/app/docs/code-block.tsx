import { CopyCode } from "./copy-code";

/** A fenced code block: monospace, scrolls sideways, with a copy button. */
export function CodeBlock({ text, lang }: { text: string; lang?: string }) {
  return (
    <div className="group relative my-5 rounded-lg border border-line-2 bg-raised">
      <div className="flex items-center justify-between border-b border-line-1 pl-3 font-mono text-[12px] text-fg-3">
        <span>{lang || "text"}</span>
        <CopyCode value={text} />
      </div>
      <pre tabIndex={0} className="overflow-x-auto p-3 font-mono text-[13px] leading-[1.6] text-fg"><code>{text}</code></pre>
    </div>
  );
}
