"use client";
/**
 * One project: its status in words, what needs you (only when something is open), then one
 * history timeline, newest first: what broke and who fixed it, what is still open, and each day's
 * successes summed. The full record (deploys, domains, services) lives one link down at /details.
 * Reads projects, catches with claims, check-ins and run history; writes nothing on any host.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Empty, ErrorLine } from "@/components/ui";
import { useApi } from "@/components/use-api";
import { sameProject, sinceWords } from "@/lib/break-guide";
import type { RunHistory } from "@/lib/run-history";
import { OpenHelp } from "./catch-log";
import { CopyForAgent, RoutingLine, agentButton } from "./copy-for-agent";
import { absoluteTime } from "./data-model";
import { extraNeeds, projectHistory, projectStatus, stillOpen, type HistoryDay, type HistoryItem, type NeedItem } from "./home-model";
import { TONE_DOT, TONE_WORD, type CatchesWithClaims } from "./home-view";
import { host, type Project, type ProjectsReport } from "./project-model";
import { projectHref } from "./projects-view";
import type { JobRow } from "./today-model";

export function ProjectView({ owner, repo }: { owner: string; repo: string }) {
  const projects = useApi<ProjectsReport>("/api/v1/projects");
  const catches = useApi<CatchesWithClaims>("/api/v1/catches", { pollMs: () => 60_000 });
  const checkins = useApi<{ jobs: JobRow[] }>("/api/v1/checkins", { pollMs: () => 60_000 });
  const runs = useApi<RunHistory>("/api/v1/checkins/history");
  const { reload: reloadCatches } = catches;
  const { reload: reloadJobs } = checkins;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [projects.data, catches.data]);
  return (
    <ProjectScreen
      name={`${owner}/${repo}`}
      ready={Boolean(projects.data) && now !== null}
      projects={projects.data}
      catches={catches.data ?? null}
      jobs={checkins.data?.jobs ?? []}
      runs={runs.data ?? null}
      error={projects.error}
      now={now ?? 0}
      onChanged={() => {
        void reloadCatches();
        void reloadJobs();
      }}
    />
  );
}

const link = "text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg";

/** Presentational, so the dev preview draws the real page against fixtures. */
export function ProjectScreen({
  name,
  ready,
  projects,
  catches,
  jobs,
  runs,
  error,
  now,
  onChanged,
}: {
  name: string;
  ready: boolean;
  projects: ProjectsReport | null | undefined;
  catches: CatchesWithClaims | null;
  jobs: JobRow[];
  runs: RunHistory | null;
  error: string | null;
  now: number;
  onChanged?: () => void;
}) {
  const all = useMemo(() => projects?.projects ?? [], [projects]);
  const p = all.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? null;
  const back = (
    <Link href="/app" className="inline-flex min-h-11 items-center gap-1.5 text-[14px] text-fg-3 transition-colors hover:text-fg">
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 3.5 5.5 8 10 12.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Projects
    </Link>
  );

  if (error) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <ErrorLine message={error} />
      </>
    );
  }
  if (!ready) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <p className="text-[16px] text-fg-2">Loading {name}…</p>
      </>
    );
  }
  if (!p) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <Empty title={`No connected repo named ${name}`}>Check the name, or install the GitHub app on the account that owns it.</Empty>
      </>
    );
  }
  return <Loaded p={p} all={all} catches={catches} jobs={jobs} runs={runs} now={now} back={back} onChanged={onChanged} />;
}

function Loaded({ p, all, catches, jobs, runs, now, back, onChanged }: { p: Project; all: Project[]; catches: CatchesWithClaims | null; jobs: JobRow[]; runs: RunHistory | null; now: number; back: ReactNode; onChanged?: () => void }) {
  const claims = useMemo(() => catches?.claims ?? [], [catches]);
  const list = useMemo(() => catches?.catches ?? [], [catches]);
  const mine = useMemo(() => list.filter((c) => c.project && sameProject(c.project, p.name)), [list, p.name]);
  const myRuns = useMemo(() => (runs?.jobs ?? []).filter((r) => r.project && sameProject(r.project, p.name)), [runs, p.name]);
  const detailsHref = `${projectHref(p.name)}/details`;
  const status = projectStatus(p, { catches: list, jobs, claims, now });
  // One item per open break (repeats of the same failure fold into it), then each open suggestion.
  const openBreaks = stillOpen(mine).filter((c) => c.status === "open");
  const openChecks = mine.filter((c) => c.kind === "check" && c.status === "open");
  const extra = extraNeeds(p, { catches: list, jobs, claims, now, detailsHref });
  const days = projectHistory({ catches: mine, deployments: p.deployments, runs: myRuns, runsSince: runs?.since ?? null, now });
  const site = p.productionUrl ?? (p.kind === "host" ? p.url : null);
  const slash = p.name.lastIndexOf("/");

  return (
    <>
      <div className="mb-4">{back}</div>
      <header className="mb-10 sm:mb-14">
        <h1 className="font-mono text-[20px] leading-[1.3] break-all text-fg sm:text-[24px]">
          {slash >= 0 ? <span className="text-fg-3">{p.name.slice(0, slash + 1)}</span> : null}
          {p.name.slice(slash + 1)}
        </h1>
        {site ? (
          <a href={site} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center font-mono text-[13px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg sm:min-h-0">
            {host(site)}
          </a>
        ) : null}
        <p className="mt-5 flex max-w-[760px] items-baseline gap-3 text-[22px] leading-[1.3] font-medium tracking-[-0.015em] text-pretty text-fg sm:text-[28px]">
          <span aria-hidden className={`size-2.5 shrink-0 -translate-y-1 self-center rounded-full ${TONE_DOT[status.tone]}`} />
          <span>
            <span className={TONE_WORD[status.tone]}>{status.word}</span>
            {status.detail ? <span className="text-fg">: {status.detail}</span> : "."}
          </span>
        </p>
      </header>

      {openBreaks.length || openChecks.length || extra.length ? (
        <Section id="needs-title" title="Needs you" meta={`${openBreaks.length + openChecks.length + extra.length} open`}>
          <ol>
            {[...openBreaks, ...openChecks].map((c) => (
              <li key={c.id} className="border-b border-line-1 py-5">
                <ItemHead tone={c.kind === "check" ? "amber" : "red"} title={c.what} at={c.caughtAt} now={now} />
                <div className="mt-3">
                  <OpenHelp c={c} now={now} claims={claims} jobs={jobs} projects={all} onChanged={onChanged} />
                </div>
              </li>
            ))}
            {extra.map((n) => (
              <li key={n.id} className="border-b border-line-1 py-5">
                <ItemHead tone={n.tone} title={n.title} at={null} now={now} />
                <NeedBlock n={n} />
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section id="history-title" title="History" meta="Last 30 days">
        {days.length ? (
          <ol>
            {days.map((d) => (
              <Day key={d.key} d={d} />
            ))}
          </ol>
        ) : (
          <p className="py-4 text-[15px] text-fg-2">Nothing happened here in the last 30 days that Spooky saw.</p>
        )}
      </Section>

      <nav aria-label="More about this project" className="mt-14 border-t border-line-1 pt-4">
        <ul className="flex flex-col text-[14px] sm:flex-row sm:flex-wrap sm:gap-x-8">
          <li>
            <Link href={detailsHref} className={`inline-flex min-h-11 items-center ${link}`}>
              Deploys, domains and services
            </Link>
          </li>
          <li>
            <Link href="/app/jobs" className={`inline-flex min-h-11 items-center ${link}`}>
              Schedules
            </Link>
          </li>
          <li>
            <Link href="/app/check" className={`inline-flex min-h-11 items-center ${link}`}>
              Check
            </Link>
          </li>
          {p.url && p.kind !== "host" ? (
            <li>
              <a href={p.url} target="_blank" rel="noreferrer" className={`inline-flex min-h-11 items-center ${link}`}>
                Repo on GitHub
              </a>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
}

function Section({ id, title, meta, children }: { id: string; title: string; meta?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-2 pb-3">
        <h2 id={id} className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
          {title}
        </h2>
        {meta ? <p className="num text-[13px] text-fg-3">{meta}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ItemHead({ tone, title, at, now }: { tone: "red" | "amber"; title: string; at: string | null; now: number }) {
  return (
    <div className="flex items-baseline gap-3">
      <span aria-hidden className={`size-2 shrink-0 -translate-y-px self-center rounded-full ${tone === "red" ? "bg-red" : "bg-amber"}`} />
      <p className="min-w-0 flex-1 text-[16px] leading-[1.4] text-pretty text-fg">
        <span className="sr-only">{tone === "red" ? "Broken: " : "Wants a look: "}</span>
        {title}
      </p>
      {at ? (
        <time dateTime={at} title={absoluteTime(at)} className="num shrink-0 text-[13px] text-fg-3">
          {sinceWords(at, now)}
        </time>
      ) : null}
    </div>
  );
}

/** Same shape as the catch log's open help: who has it, what happened, what to do, one link, the prompt. */
function NeedBlock({ n }: { n: NeedItem }) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line-1 pt-3 text-[14px] leading-[1.5]">
      <RoutingLine {...n.routing} />
      <p className="text-pretty text-fg-2">
        <span className="text-fg-3">What happened: </span>
        {n.happened}
      </p>
      <p className="text-pretty text-fg-2">
        <span className="text-fg-3">What to do: </span>
        {n.todo}
      </p>
      <div className="-ml-3 flex flex-wrap items-center gap-x-1">
        {n.action ? (
          n.action.external ? (
            <a href={n.action.href} target="_blank" rel="noreferrer" className={`${agentButton} ${link}`}>
              {n.action.label}
            </a>
          ) : (
            <Link href={n.action.href} className={`${agentButton} ${link}`}>
              {n.action.label}
            </Link>
          )
        ) : null}
        <CopyForAgent prompt={n.prompt} label="Copy fix prompt" />
      </div>
    </div>
  );
}

function Day({ d }: { d: HistoryDay }) {
  return (
    <li className="grid grid-cols-1 gap-y-1 border-b border-line-1 py-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-x-6">
      <h3 className="text-[13px] leading-[1.6] text-fg-3">{d.heading}</h3>
      <ul className="flex flex-col gap-2.5">
        {d.items.map((i) => (
          <Event key={`${i.type}-${i.id}`} i={i} />
        ))}
        {d.summary ? (
          <li className="flex items-baseline gap-3 text-[14px] text-fg-2">
            <span aria-hidden className="size-1.5 shrink-0 -translate-y-px self-center rounded-full bg-live/70" />
            <span className="num">{d.summary}</span>
          </li>
        ) : null}
      </ul>
    </li>
  );
}

function Event({ i }: { i: HistoryItem }) {
  const dot = i.type === "fixed" ? "bg-accent" : i.type === "closed" ? "ring-1 ring-inset ring-fg-3" : i.waiting ? "border border-dashed border-fg-2" : i.check ? "bg-amber" : "bg-red";
  return (
    <li className="flex items-baseline gap-3">
      <span aria-hidden className={`size-2 shrink-0 -translate-y-px self-center rounded-full ${dot}`} />
      <span className="min-w-0 text-[14px] leading-[1.5] text-pretty">
        <span className="text-fg">{i.what.replace(/[.\s]+$/, "")}.</span>{" "}
        {i.type === "fixed" ? (
          <span className="text-fg-2">
            Fixed in <span className="num">{i.took}</span>
            {i.by ? (
              <>
                {" "}by{" "}
                {i.prUrl ? (
                  <a href={i.prUrl} target="_blank" rel="noreferrer" className="underline decoration-line-3 underline-offset-4 hover:text-fg">
                    {i.by}
                  </a>
                ) : (
                  <span className={i.by.startsWith("commit ") ? "font-mono text-[13px]" : undefined}>{i.by}</span>
                )}
              </>
            ) : null}
            .{i.confirmed ? " Checked on production." : ""}
          </span>
        ) : i.type === "open" ? (
          <span className="text-fg-2">{i.waiting ? "Waiting on its next run." : i.check ? "Suggestion, waiting for you." : "Still open."}</span>
        ) : (
          <span className="text-fg-3">{i.note}</span>
        )}
      </span>
    </li>
  );
}
