/**
 * The small Markdown the legal documents use, rendered to React: headings,
 * paragraphs, bold, links, inline code, bullet and numbered lists, tables and
 * block quotes. Nothing else, on purpose: the documents are written to this
 * subset so they read the same in the repo and on the page.
 */
import type { ReactNode } from "react";

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] };

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push({ kind: "heading", level: h[1].length, text: h[2].trim() }); i += 1; continue; }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) { buf.push(lines[i].replace(/^>\s?/, "")); i += 1; }
      out.push({ kind: "quote", text: buf.join(" ").trim() }); continue;
    }
    if (line.trim().startsWith("|")) {
      const header = cells(line); i += 1;
      if (i < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i])) i += 1;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i += 1; }
      out.push({ kind: "table", header, rows }); continue;
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered) { items.push(m[3].trim()); i += 1; continue; }
        if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += " " + lines[i].trim(); i += 1; continue; }
        break;
      }
      out.push({ kind: "list", ordered, items }); continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*\||\s*([-*]|\d+\.)\s)/.test(lines[i])) { buf.push(lines[i].trim()); i += 1; }
    out.push({ kind: "paragraph", text: buf.join(" ") });
  }
  return out;
}

/** Bold, inline code and links. Text stays text; nothing is dangerously set. */
export function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) parts.push(<strong key={k++} className="font-medium text-fg">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) parts.push(<code key={k++} className="font-mono text-fg">{t.slice(1, -1)}</code>);
    else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
      const external = /^https?:/.test(lm[2]);
      parts.push(<a key={k++} href={lm[2]} className="underline decoration-line-3 underline-offset-4 hover:text-fg" {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>{lm[1]}</a>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function LegalDocument({ markdown }: { markdown: string }) {
  const blocks = parseBlocks(markdown);
  return (
    <article className="max-w-[68ch] text-[16px] leading-[1.6] text-fg-2">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading": {
            if (b.level === 1) return <h1 key={i} className="mb-3 text-[32px] leading-[1.15] font-medium tracking-[-0.02em] text-balance text-fg">{inline(b.text)}</h1>;
            if (b.level === 2) return <h2 key={i} className="mt-12 mb-3 text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">{inline(b.text)}</h2>;
            return <h3 key={i} className="mt-8 mb-2 text-[16px] font-medium text-fg">{inline(b.text)}</h3>;
          }
          case "quote":
            return <p key={i} className="my-5 border-l-2 border-amber/70 pl-4 text-fg">{inline(b.text)}</p>;
          case "list":
            return b.ordered ? (
              <ol key={i} className="my-4 list-decimal space-y-1.5 pl-6 marker:text-fg-3">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>
            ) : (
              <ul key={i} className="my-4 list-disc space-y-1.5 pl-6 marker:text-fg-3">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>
            );
          case "table":
            return (
              <div key={i} className="my-5 overflow-x-auto">
                <table className="w-full border-collapse text-[14px]">
                  <thead><tr>{b.header.map((h, j) => <th key={j} className="border-b border-line-2 py-2 pr-4 text-left font-medium text-fg">{inline(h)}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="border-b border-line-1 py-2 pr-4 align-top">{inline(c)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          default:
            return <p key={i} className="my-4">{inline(b.text)}</p>;
        }
      })}
    </article>
  );
}
