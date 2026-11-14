"use client";
/**
 * Runs and misses: the top of Schedules. One lane per job across the last 14 days. Each tick is
 * a run; a red stretch is a miss Spooky caught, from when the run was due to when the job came
 * back (green dot). Tap a lane for that job's latest miss as a short story. Real rows only.
 * The dot by a job's name is how it stands now, not its history: a job that came back is green
 * even though its misses stay red on the strip. Jobs broken now sort first.
 */
import { useState } from "react";
import type { Miss, RunHistory, RunRow } from "@/lib/run-history";
import { absoluteTime } from "../data-model";
import { duration } from "../catch-log";

const HOUR = 3_600_000;
const SHOW = 8;

/** Pure: the row dot from the job's current status. Red only when it is quiet or failing now. */
export function jobDot(status: string): { tone: "red" | "amber" | "accent" | "grey"; word: string } {
  if (status === "down") return { tone: "red", word: "broken now" };
  if (status === "late") return { tone: "amber", word: "late now" };
  if (status === "never_checked_in") return { tone: "amber", word: "never checked in" };
  if (status === "up") return { tone: "accent", word: "on time" };
  return { tone: "grey", word: status === "retired" ? "retired" : status === "paused" ? "paused" : "waiting for a first run" };
}

/** Pure: broken now first, then late, then the rest in their given order. */
export function byCurrentStatus<R extends { status: string }>(rows: R[]): R[] {
  const rank = { red: 0, amber: 1, accent: 2, grey: 2 } as const;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank[jobDot(a.r.status).tone] - rank[jobDot(b.r.status).tone] || a.i - b.i).map((x) => x.r);
}
const DOT_CLASS = { red: "bg-red", amber: "bg-amber", accent: "bg-accent", grey: "bg-fg-3" } as const;

const at = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function RunHistoryChart({ data, now }: { data: RunHistory; now: number }) {
  const since = Date.parse(data.since);
  const span = data.windowDays * 24 * HOUR;
  const x = (ms: number) => Math.min(100, Math.max(0, ((ms - since) / span) * 100));
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const sorted = byCurrentStatus(data.jobs);
  const rows = all ? sorted : sorted.slice(0, SHOW);
  const fallback = sorted.find((r) => jobDot(r.status).tone === "red") ?? sorted.find((r) => r.misses.length) ?? sorted[0] ?? null;
  const shown = data.jobs.find((r) => r.id === (hover ?? picked)) ?? fallback;
  const s = data.summary;

  // Faint lines at each local midnight, so a daily job's ticks line up by eye.
  const midnights: number[] = [];
  const d = new Date(since);
  d.setHours(24, 0, 0, 0);
  for (let t = d.getTime(); t < since + span; t = new Date(t).setDate(new Date(t).getDate() + 1)) midnights.push(t);
  const labels = [since, since + span / 2];

  return (
    <section aria-labelledby="runs-title" className="mb-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h2 id="runs-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
            Runs and misses
          </h2>
          <p className="mt-1 max-w-[520px] text-[14px] leading-[1.5] text-fg-2">
            Last {data.windowDays} days. Each tick is a run. Red is a miss Spooky caught and told you about; the green dot is when the job came back.
          </p>
        </div>
        <dl className="flex gap-8">
          <Stat label="Runs" value={s.runs.toLocaleString()} />
          <Stat label="Misses caught" value={String(s.caught)} />
          <Stat label="Median back" value={s.medianBackMinutes === null ? (s.caught ? "Not yet" : "None") : duration(s.medianBackMinutes * 60_000)} tone={s.back ? "accent" : null} />
        </dl>
      </div>

      <div className="rounded-2xl border border-line-2 bg-raised px-2 py-2 shadow-[inset_0_1px_0_var(--highlight)] sm:px-3">
        <ul className="flex flex-col">
          {rows.map((r) => {
            const active = shown?.id === r.id;
            const dot = jobDot(r.status);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  aria-pressed={picked === r.id}
                  aria-label={`${r.name}: ${r.runs} runs, ${r.misses.length} ${r.misses.length === 1 ? "miss" : "misses"}, ${dot.word}`}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(r.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => setPicked(r.id)}
                  className={`group flex min-h-11 w-full flex-col gap-1 rounded-xl px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:flex-row sm:items-center sm:gap-4 sm:px-3 ${active ? "bg-raised-2" : "hover:bg-raised-2/60"}`}
                >
                  <span className="flex min-w-0 items-center gap-2 sm:w-48 sm:shrink-0">
                    <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${DOT_CLASS[dot.tone]}`} />
                    <span className="truncate text-[13px] text-fg" title={r.name}>
                      {r.name}
                    </span>
                  </span>
                  <Lane r={r} x={x} now={now} midnights={midnights} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="relative mx-2 mt-1 h-5 sm:mr-3 sm:ml-[13.75rem]" aria-hidden>
          {labels.map((t, i) => (
            <span key={t} className="num absolute top-0 font-mono text-[11px] text-fg-3" style={{ left: `${x(t)}%`, transform: i ? "translateX(-50%)" : undefined }}>
              {new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          ))}
          <span className="absolute top-0 right-0 font-mono text-[11px] text-fg-3">now</span>
        </div>
      </div>

      {data.jobs.length > SHOW ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 min-h-11 px-1 text-[13px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
          {all ? "Show fewer" : `Show all ${data.jobs.length} jobs`}
        </button>
      ) : null}

      {shown ? <Story r={shown} now={now} /> : null}
    </section>
  );
}

function Lane({ r, x, now, midnights }: { r: RunRow; x: (ms: number) => number; now: number; midnights: number[] }) {
  const w = 100 / (14 * 24);
  return (
    <svg width="100%" height="24" className="block min-w-0 flex-1 overflow-visible" aria-hidden>
      {midnights.map((t) => (
        <line key={t} x1={`${x(t)}%`} x2={`${x(t)}%`} y1="2" y2="22" className="stroke-line-1" />
      ))}
      <line x1="0" x2="100%" y1="12" y2="12" className="stroke-line-2" />
      {r.misses.map((m) => {
        const from = x(Date.parse(m.from));
        const to = x(m.backAt ? Date.parse(m.backAt) : now);
        return (
          <g key={m.from}>
            <rect x={`${from}%`} y="3" width={`${Math.max(to - from, 0.6)}%`} height="18" rx="3" className="fill-red/[0.16]" />
            <rect x={`${from}%`} y="3" width="2" height="18" rx="1" className="fill-red" />
            {m.backAt ? <circle cx={`${to}%`} cy="12" r="3.5" className="fill-accent stroke-raised" strokeWidth="1.5" /> : null}
          </g>
        );
      })}
      {r.bins.map(([i, ok, fail]) => (
        <rect key={i} x={`${i * w}%`} y={fail ? 4 : 7} width={`${w}%`} height={fail ? 16 : 10} rx="0.5" className={fail && !ok ? "fill-red" : fail ? "fill-amber" : "fill-accent/80"} />
      ))}
    </svg>
  );
}

function Stat({ label, value, tone = null }: { label: string; value: string; tone?: "accent" | null }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-[12px] text-fg-3">{label}</dt>
      <dd className={`num text-[28px] leading-none font-medium tracking-[-0.02em] ${tone === "accent" ? "text-accent" : "text-fg"}`}>{value}</dd>
    </div>
  );
}

/** The job's latest miss as steps: due and missed, you were alerted, back. A job with no misses says how it has run. */
function Story({ r, now }: { r: RunRow; now: number }) {
  const m: Miss | undefined = r.misses[r.misses.length - 1];
  const last = r.bins.length ? r.bins[r.bins.length - 1] : null;
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-line-1 px-4 py-4 sm:flex-row sm:items-start sm:gap-8 sm:px-5" aria-live="polite">
      <div className="min-w-0 sm:w-[38%]">
        <p className="text-[12px] text-fg-3">
          {r.misses.length ? `${r.misses.length} ${r.misses.length === 1 ? "miss" : "misses"} in 14 days` : "No misses in 14 days"}
          {r.project ? <span className="font-mono"> · {r.project}</span> : null}
        </p>
        <p className="mt-1 truncate text-[15px] leading-[1.4] text-fg" title={r.name}>
          {r.name}
        </p>
        <a href={`#job-${r.id}`} className="mt-1 inline-block text-[13px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
          Settings and alerts
        </a>
      </div>
      {m ? (
        <ol className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-0">
          {[
            { label: m.kind === "failed" ? "Run failed" : m.missed > 1 ? `Missed ${m.missed} runs` : "Missed a run", at: m.from, rel: false, tone: "red" as const },
            { label: "You were alerted", at: m.alertedAt, rel: true, tone: null },
            m.backAt ? { label: "Back", at: m.backAt, rel: true, tone: "accent" as const } : { label: `Missing for ${duration(now - Date.parse(m.from))}`, at: null, rel: false, tone: null },
          ].map((st, i, arr) => (
            <li key={st.label} className="relative flex min-w-0 flex-1 items-start gap-2.5 sm:flex-col sm:gap-2 sm:pr-3">
              <span className="flex items-center sm:w-full" aria-hidden>
                <span className={`size-2 shrink-0 rounded-full ${st.tone === "red" ? "bg-red" : st.tone === "accent" ? "bg-accent" : st.at ? "bg-fg-2" : "border border-dashed border-fg-3"}`} />
                {i < arr.length - 1 ? <span className="ml-2 hidden h-px flex-1 bg-line-3 sm:block" /> : null}
              </span>
              <span className="w-full min-w-0">
                <span className="block text-[13px] leading-[1.35] text-fg">{st.label}</span>
                {st.at ? (
                  <span className="num block font-mono text-[12px] text-fg-3" title={absoluteTime(st.at)}>
                    {st.rel ? `+${duration(Date.parse(st.at) - Date.parse(m.from))}` : at(st.at)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="flex-1 text-[14px] leading-[1.5] text-fg-2">
          {r.runs ? `${r.runs.toLocaleString()} ${r.runs === 1 ? "run" : "runs"}${r.fails ? `, ${r.fails} failed` : ""}. ` : "No runs seen yet. "}
          {last ? "Spooky is watching every one; if a run is late or fails, you hear right away." : "The first check-in starts the history."}
        </p>
      )}
    </div>
  );
}
