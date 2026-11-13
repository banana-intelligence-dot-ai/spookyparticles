"use client";
/**
 * Caught and fixed: the top of Today. Each dot is something that broke in the last 30 days,
 * placed by when it broke (across) and how long it took to fix (up: higher took longer).
 * Still-open ones sit in a red band at the top; one waiting on its next run sits there hollow.
 * Ones closed without a fix (a retired project, an ignored failure) are listed under the chart.
 * Tap a dot for its story: broke, alerted, an agent asked, fixed, and by what. Real rows only;
 * an empty month says so. A line under the numbers says where every catch stands, so the
 * counts always add up.
 */
import { useMemo, useState } from "react";
import { Chips } from "@/components/ui";
import type { Catch, CatchKind, Catches } from "@/lib/catches";
import { absoluteTime } from "./data-model";

const DAY = 86_400_000;
const KIND_LABEL: Record<CatchKind, [string, string]> = {
  deploy: ["Deploy", "Deploys"],
  job: ["Job", "Jobs"],
  site: ["Site", "Sites"],
  server_errors: ["Errors", "Errors"],
  check: ["Check", "Checks"],
};
/** Time-to-fix ticks, in minutes. The axis is logarithmic so a 5-minute fix and a 3-day one both read. */
const TICKS: [number, string][] = [
  [1, "1 min"],
  [60, "1 h"],
  [1440, "1 day"],
  [10080, "1 wk"],
];
const Y_MIN = 1;
const Y_MAX = 10080;
const H = 216;
const TOP = 40; // the open band
const BOTTOM = 26; // the date axis
const plot = (m: number) => {
  const v = Math.min(Math.max(m, Y_MIN), Y_MAX);
  const f = Math.log(v / Y_MIN) / Math.log(Y_MAX / Y_MIN);
  return H - BOTTOM - f * (H - BOTTOM - TOP - 10);
};

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = m / 60;
  if (h < 24) return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`;
  const d = h / 24;
  return `${d < 10 ? Math.round(d * 10) / 10 : Math.round(d)} ${Math.round(d) === 1 ? "day" : "days"}`;
}

type Point = { c: Catch; x: number; y: number; open: boolean; minutes: number | null };
const isClosed = (c: Catch) => c.status === "retired" || c.status === "ignored";

/** Pure: one plain line that accounts for every catch, or null when all were fixed. */
export function ledger(s: Catches["summary"]): string | null {
  if (s.caught === s.fixed) return null;
  const parts = [
    `${s.fixed} fixed`,
    s.open ? `${s.open} still open` : null,
    s.waiting ? `${s.waiting} waiting on ${s.waiting === 1 ? "its" : "their"} next run` : null,
    s.closed ? `${s.closed} closed without a fix` : null,
  ].filter(Boolean);
  return `Of ${s.caught}: ${parts.join(", ")}.`;
}

/** Pure: where each catch sits. x in percent of the window, y in px. Closed ones are not plotted. */
export function catchPoints(list: Catch[], now: number, windowDays: number): Point[] {
  const start = now - windowDays * DAY;
  return list.filter((c) => !isClosed(c)).map((c) => {
    const broke = Date.parse(c.caughtAt);
    const minutes = c.fixedAt ? (Date.parse(c.fixedAt) - broke) / 60_000 : null;
    const x = Math.min(99, Math.max(1, ((Math.max(broke, start) - start) / (now - start)) * 100));
    return { c, x, y: minutes === null ? TOP / 2 + 2 : plot(minutes), open: minutes === null, minutes };
  });
}

export function CatchLog({ data, now }: { data: Catches; now: number }) {
  const kinds = useMemo(() => [...new Set(data.catches.map((c) => c.kind))], [data]);
  const [kind, setKind] = useState<CatchKind | "all">("all");
  const list = kind === "all" ? data.catches : data.catches.filter((c) => c.kind === kind);
  const points = useMemo(() => catchPoints(list, now, data.windowDays), [list, now, data.windowDays]);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  // Default story: the newest fix, else the newest open one.
  const fallback = list.find((c) => c.fixedAt) ?? list[0] ?? null;
  const shown = list.find((c) => c.id === (hover ?? picked)) ?? fallback;
  const s = data.summary;
  const closed = list.filter(isClosed);
  const line = ledger(s);
  const days = [...Array(5)].map((_, i) => now - (data.windowDays - (i * data.windowDays) / 4) * DAY);

  return (
    <section aria-labelledby="caught-title" className="mb-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h2 id="caught-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
            Caught and fixed
          </h2>
          <p className="mt-1 max-w-[520px] text-[14px] leading-[1.5] text-fg-2">
            Fixed by the time you realize it&apos;s broken. Each dot is something that broke in the last {data.windowDays} days; the lower it sits, the faster it was fixed.
          </p>
          {line ? <p className="mt-2 max-w-[520px] text-[13px] leading-[1.5] text-fg">{line}</p> : null}
        </div>
        <dl className="flex gap-8">
          <Stat label="Caught" value={String(s.caught)} />
          <Stat label="Fixed" value={String(s.fixed)} tone={s.fixed ? "accent" : null} />
          {s.open ? <Stat label="Open" value={String(s.open)} tone="red" /> : null}
          <Stat label="Median fix" value={s.medianFixMinutes === null ? "None yet" : duration(s.medianFixMinutes * 60_000)} />
        </dl>
      </div>

      {data.catches.length ? (
        <>
          {kinds.length > 1 ? (
            <div className="mb-3">
              <Chips
                label="Show"
                value={kind}
                onChange={(k) => {
                  setKind(k);
                  setPicked(null);
                }}
                options={[
                  { key: "all" as const, label: "All", count: data.catches.length },
                  ...kinds.map((k) => ({ key: k, label: KIND_LABEL[k][1], count: data.catches.filter((c) => c.kind === k).length })),
                ]}
              />
            </div>
          ) : null}

          <div className="relative rounded-2xl border border-line-2 bg-raised pt-2 pr-4 pl-14 shadow-[inset_0_1px_0_var(--highlight)] sm:pr-6 sm:pl-16">
            {/* Axis words live outside the plot so no line or dot ever runs through them. */}
            <span className="absolute left-3 font-mono text-[11px] text-red sm:left-4" style={{ top: 8 + TOP / 2 - 6 }} aria-hidden>
              Open
            </span>
            {TICKS.map(([m, label]) => (
              <span key={m} className="num absolute left-3 font-mono text-[11px] text-fg-3 sm:left-4" style={{ top: 8 + plot(m) - 8 }} aria-hidden>
                {label}
              </span>
            ))}
            <svg role="img" aria-labelledby="caught-title" width="100%" height={H} className="block overflow-visible">
              {/* the open band */}
              <rect x="0" y="4" width="100%" height={TOP - 8} rx="8" className="fill-red/[0.06]" />
              {TICKS.map(([m]) => (
                <line key={m} x1="0" x2="100%" y1={plot(m)} y2={plot(m)} className="stroke-line-1" />
              ))}
              {s.medianFixMinutes !== null ? (
                <g>
                  <line x1="0" x2="100%" y1={plot(s.medianFixMinutes)} y2={plot(s.medianFixMinutes)} className="stroke-accent/50" strokeDasharray="3 4" />
                  <text x="100%" y={plot(s.medianFixMinutes) - 5} textAnchor="end" className="fill-accent text-[11px]" style={{ fontFamily: "var(--font-mono)" }}>
                    median {duration(s.medianFixMinutes * 60_000)}
                  </text>
                </g>
              ) : null}
              {days.map((d, i) => (
                <text
                  key={d}
                  x={`${i * 25}%`}
                  y={H - 6}
                  textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
                  className="fill-fg-3 text-[11px]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {i === 4 ? "today" : new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </text>
              ))}
              {points.map((p) => {
                const active = shown?.id === p.c.id;
                return (
                  <g
                    key={p.c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.c.what}${p.c.project ? `, ${p.c.project}` : ""}. ${p.c.status === "waiting" ? "Waiting on its next run" : p.open ? "Still open" : `Fixed in ${duration((p.minutes ?? 0) * 60_000)}`}`}
                    aria-pressed={picked === p.c.id}
                    className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-fg"
                    onMouseEnter={() => setHover(p.c.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(p.c.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setPicked(p.c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPicked(p.c.id);
                      }
                    }}
                  >
                    {/* a generous invisible target, 44 px across */}
                    <circle cx={`${p.x}%`} cy={p.y} r="22" fill="transparent" />
                    <circle
                      cx={`${p.x}%`}
                      cy={p.y}
                      r={active ? 7 : 5}
                      className={`transition-[r] duration-150 ${p.c.status === "waiting" ? `fill-bg ${active ? "stroke-fg" : "stroke-fg-2"}` : `${p.open ? "fill-red" : "fill-accent"} ${active ? "stroke-fg" : "stroke-bg"}`}`}
                      strokeWidth={active ? 2 : 1.5}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {closed.length ? (
            <p className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-fg-3">
              <span>Closed without a fix:</span>
              {closed.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPicked(c.id)}
                  aria-pressed={picked === c.id}
                  className="min-h-[44px] rounded px-1 text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg sm:min-h-0"
                >
                  {c.project ?? c.what}
                  {i < closed.length - 1 ? "," : ""}
                </button>
              ))}
            </p>
          ) : null}

          {shown ? <Story c={shown} now={now} /> : null}
        </>
      ) : (
        <p className="rounded-2xl border border-line-2 bg-raised px-5 py-6 text-[14px] leading-[1.6] text-fg-2">
          Nothing broke in the last {data.windowDays} days that Spooky Particles saw. When a deploy fails, a job goes quiet or a site goes down, it lands here with how long the fix took.
        </p>
      )}
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

/** One catch as a short story: broke, alerted, an agent asked, fixed. Each step says how long after the break. */
function Story({ c, now }: { c: Catch; now: number }) {
  const broke = Date.parse(c.caughtAt);
  const after = (at: string) => `+${duration(Date.parse(at) - broke)}`;
  const steps: { label: string; at: string | null; note?: string; tone?: "red" | "accent" }[] = [
    { label: "Broke", at: c.caughtAt, tone: "red" },
    ...(c.alertedAt ? [{ label: "You were alerted", at: c.alertedAt }] : []),
    ...(c.heardAt ? [{ label: c.agent ? `${c.agent} asked about it` : "Your agent asked about it", at: c.heardAt }] : []),
    c.fixedAt
      ? { label: "Fixed", at: c.fixedAt, tone: "accent" as const, note: c.fixedBy?.kind === "commit" ? `${c.fixedBy.sha}${c.fixedBy.message ? ` ${c.fixedBy.message}` : ""}` : undefined }
      : c.status === "waiting"
        ? { label: "Waiting on its next run", at: null, note: c.nextRunAt ? `due ${new Date(c.nextRunAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : undefined }
        : c.status === "retired"
          ? { label: "Closed: project retired", at: null }
          : c.status === "ignored"
            ? { label: "Closed: you ignored it", at: null }
            : { label: `Open for ${duration(now - broke)}`, at: null },
    ...(c.fixedAt && c.confirmedAt ? [{ label: "Checked on production", at: c.confirmedAt, tone: "accent" as const }] : []),
  ];
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-line-1 px-4 py-4 sm:flex-row sm:items-start sm:gap-8 sm:px-5" aria-live="polite">
      <div className="min-w-0 sm:w-[38%]">
        <p className="text-[12px] text-fg-3">
          {KIND_LABEL[c.kind][0]}
          {c.project ? <span className="font-mono"> · {c.project}</span> : null}
        </p>
        <p className="mt-1 text-[15px] leading-[1.4] text-pretty text-fg">{c.what}</p>
        {c.note ? <p className="mt-1 text-[13px] leading-[1.45] text-pretty text-fg-2">{c.note}</p> : null}
        {c.fixedBy?.kind === "pr" ? (
          <a href={c.fixedBy.url} className="mt-1 inline-block text-[13px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg" target="_blank" rel="noreferrer">
            The fix your agent opened
          </a>
        ) : null}
      </div>
      <ol className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-0">
        {steps.map((st, i) => (
          <li key={st.label} className="relative flex min-w-0 flex-1 items-start gap-2.5 sm:flex-col sm:gap-2 sm:pr-3">
            <span className="flex items-center sm:w-full" aria-hidden>
              <span className={`size-2 shrink-0 rounded-full ${st.tone === "red" ? "bg-red" : st.tone === "accent" ? "bg-accent" : st.at ? "bg-fg-2" : "border border-dashed border-fg-3"}`} />
              {i < steps.length - 1 ? <span className="ml-2 hidden h-px flex-1 bg-line-3 sm:block" /> : null}
            </span>
            <span className="w-full min-w-0 overflow-hidden">
              <span className="block text-[13px] leading-[1.35] text-fg">{st.label}</span>
              {st.at ? (
                <span className="num block font-mono text-[12px] text-fg-3" title={absoluteTime(st.at)}>
                  {i === 0 ? new Date(st.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : after(st.at)}
                </span>
              ) : null}
              {st.note ? <span className="mt-0.5 block truncate font-mono text-[12px] text-fg-3" title={st.note}>{st.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
