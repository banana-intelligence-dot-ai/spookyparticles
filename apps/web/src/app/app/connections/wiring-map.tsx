"use client";
/**
 * How it's wired: the top of Connections. What Spooky reads on the left, your agents that ask it
 * on the right, one line each. A solid green line is live, amber is stale, red is broken, dashed
 * has never been used. Tap a node for its state in one line; a broken one with a fix (sign in
 * again) goes straight to it. Real rows only.
 */
import { useMemo, useState } from "react";
import { PROVIDER, fixFor, isRunning, type Connection, type Fix } from "../connection-model";
import { absoluteTime, relativeTime } from "../data-model";
import type { AgentKey } from "./agents";

const DAY = 86_400_000;
type Wire = "live" | "stale" | "broken" | "never";
type Node = { id: string; side: "in" | "out"; title: string; sub: string; wire: Wire; line: string; at: string | null; fix?: Fix | null };

/** Pure: a node per live connection and per unrevoked agent key, each with the state of its line. */
export function wiring(connections: Connection[], keys: AgentKey[], now: number): Node[] {
  const sources: Node[] = connections
    .filter((c) => c.status !== "revoked")
    .map((c) => {
      const wire: Wire =
        c.status === "errored" ? "broken" : isRunning(c.sync) ? "live" : !c.lastSyncedAt ? "never" : now - Date.parse(c.lastSyncedAt) > 2 * DAY ? "stale" : "live";
      const line =
        wire === "broken"
          ? (c.statusReason ?? "Spooky can't read this one.")
          : isRunning(c.sync)
            ? "Reading now."
            : c.lastSyncedAt
              ? `Last read ${relativeTime(c.lastSyncedAt, now)}. Read-only.`
              : "Connected; the first read hasn't finished.";
      return { id: c.id, side: "in", title: PROVIDER[c.provider], sub: c.display, wire, line, at: c.lastSyncedAt, fix: fixFor(c) };
    });
  const agents: Node[] = keys
    .filter((k) => !k.revokedAt)
    .map((k) => {
      const wire: Wire = !k.lastUsedAt ? "never" : now - Date.parse(k.lastUsedAt) > 7 * DAY ? "stale" : "live";
      const line = k.lastUsedAt ? `Asked Spooky ${relativeTime(k.lastUsedAt, now)}. ${k.scopes.includes("write") ? "Read and write." : "Read-only."}` : "Has never asked Spooky. Give the agent its key to wire it up.";
      return { id: k.id, side: "out", title: k.name, sub: k.prefix, wire, line, at: k.lastUsedAt };
    });
  return [...sources, ...agents];
}

const STROKE: Record<Wire, string> = { live: "bg-accent/70", stale: "bg-amber", broken: "bg-red", never: "" };
const DASH = "border-t border-dashed border-fg-3/60";
const DOT: Record<Wire, string> = { live: "bg-accent", stale: "bg-amber", broken: "bg-red", never: "ring-1 ring-inset ring-fg-3" };
const WORD: Record<Wire, string> = { live: "live", stale: "stale", broken: "broken", never: "never used" };

export function WiringMap({ connections, keys, now }: { connections: Connection[]; keys: AgentKey[]; now: number }) {
  const nodes = useMemo(() => wiring(connections, keys, now), [connections, keys, now]);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  if (!nodes.some((n) => n.side === "in")) return null;
  const shown = nodes.find((n) => n.id === (hover ?? picked)) ?? null;
  const ins = nodes.filter((n) => n.side === "in");
  const outs = nodes.filter((n) => n.side === "out");
  const broken = nodes.filter((n) => n.wire === "broken").length;
  const reading = ins.filter((n) => n.wire === "live").length;
  const listening = outs.filter((n) => n.wire === "live").length;

  const fixes = nodes.filter((n) => n.fix);
  const node = (n: Node) => {
    const look = `flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:shrink-0 ${n.fix ? "sm:w-auto sm:min-w-56" : "sm:w-56"} ${
      shown?.id === n.id ? "border-line-3 bg-raised-2" : n.wire === "broken" ? "border-red/50 hover:bg-raised-2/60" : "border-line-2 hover:bg-raised-2/60"
    }`;
    const hoverProps = { onMouseEnter: () => setHover(n.id), onMouseLeave: () => setHover(null), onFocus: () => setHover(n.id), onBlur: () => setHover(null) };
    const face = (
      <>
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[n.wire]}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-[1.3] text-fg">{n.title}</span>
          <span className="block truncate font-mono text-[11px] leading-[1.3] text-fg-3">{n.sub}</span>
        </span>
        {n.fix ? <span className="shrink-0 rounded-md border border-red/40 px-2 py-0.5 text-[12px] text-red">{n.fix.label}</span> : null}
      </>
    );
    return (
      <li key={n.id} className={`flex items-center ${n.side === "in" ? "sm:flex-row" : "sm:flex-row-reverse"}`}>
        {n.fix ? (
          <a href={n.fix.href} {...(n.fix.external ? { target: "_blank", rel: "noreferrer" } : {})} aria-label={`${n.title}, ${n.sub}: broken. ${n.fix.label}`} {...hoverProps} className={look}>
            {face}
          </a>
        ) : (
          <button type="button" aria-pressed={picked === n.id} aria-label={`${n.title}, ${n.sub}: ${WORD[n.wire]}`} {...hoverProps} onClick={() => setPicked(picked === n.id ? null : n.id)} className={look}>
            {face}
          </button>
        )}
        {/* The wire: from the node to the bus that runs into Spooky. */}
        <span aria-hidden className={`hidden min-w-6 flex-1 sm:block ${n.wire === "never" ? DASH : `h-0.5 ${STROKE[n.wire]}`}`} />
      </li>
    );
  };
  const fixLink = (f: Fix) => (
    <a href={f.href} {...(f.external ? { target: "_blank", rel: "noreferrer" } : {})} className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
      {f.label}
    </a>
  );

  return (
    <section aria-labelledby="wiring-title" className="mb-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h2 id="wiring-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
            How it&apos;s wired
          </h2>
          <p className="mt-1 max-w-[520px] text-[14px] leading-[1.5] text-fg-2">
            What Spooky reads, and the agents it tells. Green is live, amber is stale, red is broken.
          </p>
        </div>
        <dl className="flex gap-8">
          <Stat label="Reading" value={`${reading} of ${ins.length}`} />
          <Stat label="Agents listening" value={outs.length ? `${listening} of ${outs.length}` : "None"} tone={listening ? "accent" : null} />
          <Stat label="Broken" value={String(broken)} tone={broken ? "red" : null} />
        </dl>
      </div>

      <div className="rounded-2xl border border-line-2 bg-raised px-3 py-4 shadow-[inset_0_1px_0_var(--highlight)] sm:px-5">
        <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-0">
          <div>
            <p className="mb-2 text-[12px] text-fg-3 sm:hidden">Reads from</p>
            <ul className="flex flex-col gap-2 sm:border-r sm:border-line-3" aria-label="What Spooky reads">
              {ins.map(node)}
            </ul>
          </div>
          <div className="flex items-center sm:px-0">
            <span aria-hidden className="hidden h-0.5 w-6 bg-line-3 sm:block" />
            <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-3 bg-raised-2 px-4 font-mono text-[13px] text-fg shadow-[inset_0_1px_0_var(--highlight)]">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              spooky
            </span>
            <span aria-hidden className="hidden h-0.5 w-6 bg-line-3 sm:block" />
          </div>
          <div>
            <p className="mb-2 text-[12px] text-fg-3 sm:hidden">Tells</p>
            {outs.length ? (
              <ul className="flex flex-col gap-2 sm:border-l sm:border-line-3" aria-label="Agents that ask Spooky">
                {outs.map(node)}
              </ul>
            ) : (
              <p className="flex min-h-11 items-center text-[13px] text-fg-3 sm:border-l sm:border-dashed sm:border-line-3 sm:pl-6">No agent yet. Make a key below.</p>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 flex min-h-11 flex-wrap items-center gap-x-2 text-[14px] text-fg-2" aria-live="polite">
        {shown ? (
          <>
            <span className="text-fg">{shown.title}</span>
            <span className="font-mono text-fg-3">{shown.sub}</span>
            <span className="text-fg-3">·</span>
            <span className={shown.wire === "broken" ? "text-red" : ""} title={shown.at ? absoluteTime(shown.at) : undefined}>
              {shown.line}
            </span>
            {shown.fix ? fixLink(shown.fix) : null}
          </>
        ) : fixes.length === 1 && fixes[0].fix ? (
          <>
            <span>
              <span className="font-mono text-fg">{fixes[0].sub}</span> can&apos;t be read.
            </span>
            {fixLink(fixes[0].fix)}
          </>
        ) : broken ? (
          "A red line means Spooky can't see that part of your stack. Tap the red box to fix it."
        ) : (
          "Spooky only reads. It never writes to your accounts or deletes anything."
        )}
      </p>
    </section>
  );
}

function Stat({ label, value, tone = null }: { label: string; value: string; tone?: "accent" | "red" | null }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-[12px] text-fg-3">{label}</dt>
      <dd className={`num text-[28px] leading-none font-medium tracking-[-0.02em] ${tone === "accent" ? "text-accent" : tone === "red" ? "text-red" : "text-fg"}`}>{value}</dd>
    </div>
  );
}
