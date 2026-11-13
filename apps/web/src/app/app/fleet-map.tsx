"use client";
/**
 * Your fleet: the top of Projects. A chip per project, grouped by what it needs from you.
 * Red is broken now, amber wants a look, grey runs fine, faint is quiet. A gold edge is a quiet
 * project still billed. Tap one for the project in one line. Real rows only.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCents } from "@/components/use-api";
import { healthReason, type Health, type Project } from "./project-model";
import { idlePaid, projectHref } from "./projects-view";

type Group = { key: string; label: string; health: Health[] };
const GROUPS: Group[] = [
  { key: "need", label: "Needs you", health: ["failed", "attention"] },
  { key: "run", label: "Running", health: ["ok"] },
  { key: "nodata", label: "No data yet", health: ["unknown"] },
  { key: "quiet", label: "Quiet", health: ["idle", "archived"] },
];
const WORD: Record<Health, string> = { failed: "Failing", attention: "Wants a look", ok: "Running", unknown: "No data yet", idle: "Idle", archived: "Archived" };
const FILL: Record<Health, string> = {
  failed: "bg-red",
  attention: "bg-amber",
  ok: "bg-fg-3/45",
  unknown: "border border-dashed border-fg-3/70",
  idle: "bg-fg-3/15",
  archived: "border border-fg-3/40",
};

/** Pure: each group's projects, worst first, then the ones that cost most, then by name. Empty groups drop out. */
export function fleetGroups(projects: Project[]): { g: Group; list: Project[] }[] {
  return GROUPS.map((g) => ({
    g,
    list: projects
      .filter((p) => g.health.includes(p.health))
      .sort((a, b) => g.health.indexOf(a.health) - g.health.indexOf(b.health) || (b.monthlyCents ?? 0) - (a.monthlyCents ?? 0) || a.name.localeCompare(b.name)),
  })).filter((x) => x.list.length);
}

const short = (name: string) => name.slice(name.indexOf("/") + 1);

export function FleetMap({ projects, now }: { projects: Project[]; now: number }) {
  const groups = useMemo(() => fleetGroups(projects), [projects]);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const shown = projects.find((p) => p.id === (hover ?? picked)) ?? null;
  const need = projects.filter((p) => p.health === "failed" || p.health === "attention").length;
  const paid = projects.filter((p) => idlePaid(p, now));
  const paidCents = paid.reduce((n, p) => n + (p.monthlyCents ?? 0), 0);

  return (
    <section aria-labelledby="fleet-title" className="mb-12">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h2 id="fleet-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
            Your fleet
          </h2>
          <p className="mt-1 max-w-[520px] text-[14px] leading-[1.5] text-fg-2">
            Every project, grouped by what it needs. Red is broken now, amber wants a look. A gold edge is a quiet project you still pay for.
          </p>
        </div>
        <dl className="flex gap-8">
          <Stat label="Watched" value={String(projects.length)} />
          <Stat label="Need you" value={String(need)} tone={need ? "red" : null} />
          <Stat label="Quiet, still paid" value={paidCents ? formatCents(paidCents) : "None"} tone={paidCents ? "amber" : null} />
        </dl>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line-2 bg-raised px-3 py-3 sm:gap-0 shadow-[inset_0_1px_0_var(--highlight)] sm:px-5">
        {groups.map(({ g, list }) => (
          <div key={g.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
            <p className="text-[12px] text-fg-3 sm:w-28 sm:shrink-0 sm:pt-3">
              {g.label} <span className="num font-mono">{list.length}</span>
            </p>
            <ul className="flex flex-wrap gap-0.5" aria-label={g.label}>
              {list.map((p) => {
                const owes = idlePaid(p, now);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={picked === p.id}
                      aria-label={`${p.name}: ${WORD[p.health]}${p.monthlyCents ? `, ${formatCents(p.monthlyCents)} a month` : ""}`}
                      onMouseEnter={() => setHover(p.id)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(p.id)}
                      onBlur={() => setHover(null)}
                      onClick={() => setPicked(picked === p.id ? null : p.id)}
                      className={`flex min-h-11 max-w-[15rem] items-center gap-2 rounded-lg px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${shown?.id === p.id ? "bg-raised-2" : "hover:bg-raised-2/60"}`}
                    >
                      <span aria-hidden className={`block size-3 shrink-0 rounded-[4px] ${FILL[p.health]} ${owes ? "ring-2 ring-amber ring-offset-2 ring-offset-raised" : ""}`} />
                      <span className={`truncate font-mono text-[13px] ${g.key === "need" ? "text-fg" : g.key === "quiet" ? "text-fg-3" : "text-fg-2"}`}>{short(p.name)}</span>
                      {owes ? <span className="num shrink-0 font-mono text-[12px] text-amber">{formatCents(p.monthlyCents ?? 0)}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-3 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-[14px]" aria-live="polite">
        {shown ? (
          <>
            <span className="font-mono text-fg">{short(shown.name)}</span>
            <span className="text-fg-3">·</span>
            <span className="text-fg-2">
              {healthReason(shown, now) ?? WORD[shown.health]}
              {shown.monthlyCents ? (
                <>
                  {" "}
                  <span className={`num font-mono ${idlePaid(shown, now) ? "text-amber" : "text-fg"}`}>{formatCents(shown.monthlyCents)}</span>/mo.
                </>
              ) : null}
            </span>
            <Link href={projectHref(shown.name)} className="inline-flex min-h-11 items-center text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
              Open
            </Link>
          </>
        ) : need ? (
          <span className="text-fg-2">Tap a project for what Spooky saw.</span>
        ) : (
          <span className="text-fg-2">Nothing needs you. Spooky checks every deploy and tells you the moment one breaks.</span>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone = null }: { label: string; value: string; tone?: "red" | "amber" | null }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-[12px] text-fg-3">{label}</dt>
      <dd className={`num text-[28px] leading-none font-medium tracking-[-0.02em] ${tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : "text-fg"}`}>{value}</dd>
    </div>
  );
}
