"use client";
/**
 * Every project, every check: the top of Check. A row per Vercel project, a column per check.
 * Amber needs a look, red is a secret exposed now, green was fixed, a grey tick passes. Tap a
 * cell for the finding in one line; a cell that needs a look opens its finding in the list below,
 * where it can go to an agent. Real rows only.
 */
import { useMemo, useState } from "react";
import { findingAnchor } from "./check-prompt";
import type { Check, CheckProject, CheckReport } from "./check-view";

type Cell = "exposed" | "open" | "fixed" | "ok" | "unknown" | "not_applicable" | "dismissed" | "none";

/** Column words short enough for a phone; the full name is in the cell's label. */
const SHORT: Record<string, string> = {
  previews_open: "Previews",
  secret_not_sensitive: "Secrets",
  secret_in_public_code: "Public code",
  cron_unguarded: "Crons",
  deps_not_updated: "Updates",
};
const WORD: Record<Cell, string> = {
  exposed: "exposed now",
  open: "needs a look",
  fixed: "fixed",
  ok: "passes",
  unknown: "not checked yet",
  not_applicable: "does not apply",
  dismissed: "dismissed",
  none: "not checked",
};

export function cellOf(c: Check | undefined): Cell {
  if (!c) return "none";
  if (c.dismissedAt) return "dismissed";
  if (c.state === "open") return c.severity === "exposed" ? "exposed" : "open";
  if (c.state === "ok") return c.fixedAt ? "fixed" : "ok";
  if (c.state === "not_applicable") return "not_applicable";
  return "unknown";
}

/** Projects with the most to fix first, then the ones not fully checked, then all clear. */
export function matrixRows(projects: CheckProject[]): CheckProject[] {
  const score = (p: CheckProject) => {
    const cells = p.checks.map(cellOf);
    return cells.filter((c) => c === "exposed").length * 100 + cells.filter((c) => c === "open").length * 10 + (cells.includes("unknown") ? 1 : 0);
  };
  return [...projects].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function CheckMatrix({ report }: { report: CheckReport }) {
  const rows = useMemo(() => matrixRows(report.projects), [report]);
  const columns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of report.projects) for (const c of p.checks) if (!seen.has(c.check)) seen.set(c.check, c.name);
    return [...seen.entries()];
  }, [report]);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const keyOf = (p: CheckProject, check: string) => `${p.nodeId}:${check}`;
  const active = hover ?? picked;
  const found = (() => {
    for (const p of rows) for (const [check] of columns) if (keyOf(p, check) === active) return { p, c: p.checks.find((x) => x.check === check) };
    return null;
  })();
  const clear = rows.filter((p) => p.checks.every((c) => ["ok", "fixed", "not_applicable", "dismissed"].includes(cellOf(c)))).length;
  const s = report.summary;

  // A finding that needs a look opens in place; anything else jumps to its project.
  const jump = (p: CheckProject, c?: Check) => {
    const row = c?.id && (cellOf(c) === "open" || cellOf(c) === "exposed") ? document.getElementById(findingAnchor(c.id)) : null;
    const el = row ?? document.getElementById(`check-p-${p.nodeId}`);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  return (
    <section aria-labelledby="matrix-title" className="mb-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h2 id="matrix-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
            Every project, every check
          </h2>
          <p className="mt-1 max-w-[520px] text-[14px] leading-[1.5] text-fg-2">
            Amber needs a look, red is exposed now, green was fixed. Tap an amber or red square to open it and hand it to your agent.
          </p>
        </div>
        <dl className="flex gap-8">
          <Stat label="Open" value={String(s.open)} tone={s.open ? "amber" : null} />
          <Stat label="Fixed" value={String(s.fixed)} tone={s.fixed ? "accent" : null} />
          <Stat label="All clear" value={`${clear} of ${rows.length}`} />
        </dl>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line-2 bg-raised px-2 py-3 shadow-[inset_0_1px_0_var(--highlight)] sm:px-4">
        <table className="w-full border-separate border-spacing-0">
          <caption className="sr-only">Check results by project</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[38%] px-2 pb-2 text-left text-[12px] font-normal text-fg-3">
                Project
              </th>
              {columns.map(([check, name]) => (
                <th key={check} scope="col" title={name} className="px-0.5 pb-2 text-center align-bottom text-[11px] leading-[1.2] font-normal text-fg-3 sm:text-[12px]">
                  <span className="sm:hidden">{SHORT[check] ?? name}</span>
                  <span className="hidden sm:inline">{name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.nodeId}>
                <th scope="row" className="max-w-0 px-2 text-left font-normal">
                  <span className="block truncate font-mono text-[13px] text-fg" title={p.name}>
                    {p.name}
                  </span>
                </th>
                {columns.map(([check, name]) => {
                  const c = p.checks.find((x) => x.check === check);
                  const cell = cellOf(c);
                  const k = keyOf(p, check);
                  return (
                    <td key={check} className="p-0.5 text-center">
                      <button
                        type="button"
                        disabled={!c}
                        aria-label={`${p.name}, ${name}: ${WORD[cell]}`}
                        aria-pressed={picked === k}
                        onMouseEnter={() => setHover(k)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(k)}
                        onBlur={() => setHover(null)}
                        onClick={() => {
                          setPicked(k);
                          if (c && (cell === "open" || cell === "exposed")) jump(p, c);
                        }}
                        className={`inline-grid size-11 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${active === k ? "bg-raised-2" : c ? "hover:bg-raised-2/60" : ""}`}
                      >
                        <Square cell={cell} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-[14px]" aria-live="polite">
        {found?.c ? (
          <>
            <span className="font-mono text-fg">{found.p.name}</span>
            <span className="text-fg-3">·</span>
            <span className="text-fg-2">
              {found.c.name}: {cellOf(found.c) === "open" || cellOf(found.c) === "exposed" ? found.c.title : WORD[cellOf(found.c)]}
              {cellOf(found.c) === "fixed" && found.c.fixedAt ? ` ${new Date(found.c.fixedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
            </span>
            <button type="button" onClick={() => jump(found.p, found.c)} className="inline-flex min-h-11 items-center text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
              See it below
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** One square, drawn the way the list below draws its marks: loud only when it needs you. */
function Square({ cell }: { cell: Cell }) {
  const base = "block size-6 rounded-[6px]";
  if (cell === "exposed") return <span className={`${base} bg-red`} />;
  if (cell === "open") return <span className={`${base} bg-amber`} />;
  if (cell === "fixed")
    return (
      <span className={`${base} grid place-items-center bg-accent/20 ring-1 ring-accent/60 ring-inset`}>
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
          <path d="M5.5 10.4 8.6 13.4 14.5 7" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="stroke-accent" />
        </svg>
      </span>
    );
  if (cell === "ok") return <span className={`${base} bg-fg-3/25`} />;
  if (cell === "unknown") return <span className={`${base} border border-dashed border-fg-3/70`} />;
  if (cell === "not_applicable" || cell === "dismissed") return <span className="block h-px w-4 bg-fg-3/60" />;
  return <span className="block size-1 rounded-full bg-line-3" />;
}

function Stat({ label, value, tone = null }: { label: string; value: string; tone?: "accent" | "amber" | null }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-[12px] text-fg-3">{label}</dt>
      <dd className={`num text-[28px] leading-none font-medium tracking-[-0.02em] ${tone === "accent" ? "text-accent" : tone === "amber" ? "text-amber" : "text-fg"}`}>{value}</dd>
    </div>
  );
}
