"use client";
/**
 * Projects: one list, broken first, each with its status in words. Quiet and no-data projects
 * fold away, and so do the ones the owner stopped watching. Reads projects, catches with claims
 * and check-ins; writes nothing.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Empty, ErrorLine, PageHeader } from "@/components/ui";
import { useApi } from "@/components/use-api";
import type { Catches } from "@/lib/catches";
import type { Claim } from "@/lib/claims";
import { type Connection, isRunning } from "./connection-model";
import { absoluteTime } from "./data-model";
import { type JobRow, projectStatus, type ProjectStatus, sortByStatus, splitQuiet, type Tone } from "./home-model";
import { ago, projectHref, type ProjectsReport } from "./project-model";

export type CatchesWithClaims = Catches & { claims?: Claim[] };

export function ProjectsListView() {
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => isRunning(c.sync)) ? 5000 : null),
  });
  const projects = useApi<ProjectsReport>("/api/v1/projects");
  const catches = useApi<CatchesWithClaims>("/api/v1/catches", { pollMs: () => 60_000 });
  const checkins = useApi<{ jobs: JobRow[] }>("/api/v1/checkins", { pollMs: () => 60_000 });
  const { reload } = projects;

  // While a sync runs, connections poll and the list refills on the same beat.
  useEffect(() => {
    if (conns.data) void reload();
  }, [conns.data, reload]);

  // The clock is read in an effect, once per refresh: never Date.now() during render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [projects.data, catches.data]);

  return (
    <ProjectsList
      ready={Boolean(conns.data) && Boolean(projects.data) && now !== null}
      connections={conns.data?.connections ?? []}
      projects={projects.data}
      catches={catches.data ?? null}
      jobs={checkins.data?.jobs ?? []}
      error={conns.error ?? projects.error}
      now={now ?? 0}
    />
  );
}

export const TONE_DOT: Record<Tone, string> = {
  broken: "bg-red",
  look: "bg-amber",
  fine: "bg-live",
  quiet: "bg-fg-3",
  none: "ring-1 ring-inset ring-fg-3",
};
export const TONE_WORD: Record<Tone, string> = {
  broken: "text-red",
  look: "text-amber",
  fine: "text-fg",
  quiet: "text-fg-2",
  none: "text-fg-2",
};

/** Presentational, so the dev preview draws the real screen against fixtures. */
export function ProjectsList({
  ready,
  connections,
  projects,
  catches,
  jobs,
  error,
  now,
}: {
  ready: boolean;
  connections: Connection[];
  projects: ProjectsReport | null | undefined;
  catches: CatchesWithClaims | null;
  jobs: JobRow[];
  error: string | null;
  now: number;
}) {
  const [showQuiet, setShowQuiet] = useState(false);
  const list = useMemo(() => projects?.projects ?? [], [projects]);
  const rows = useMemo(() => {
    const ctx = { catches: catches?.catches ?? [], jobs, claims: catches?.claims ?? [], now };
    return sortByStatus(list.map((p) => ({ name: p.name, project: p, status: projectStatus(p, ctx) })));
  }, [list, catches, jobs, now]);
  const { shown, folded } = splitQuiet(rows);
  const stopped = folded.filter((r) => r.project.muted?.all).length;
  const syncing = connections.some((c) => isRunning(c.sync));
  const last = connections.map((c) => c.lastSyncedAt).filter((x): x is string => Boolean(x)).sort().at(-1);

  return (
    <>
      <PageHeader title="Projects" lede="Every repo and Vercel project Spooky reads, broken first. Open one for its deploys, jobs and site.">
        <p className="text-[13px] text-fg-3">{syncing ? "Syncing now" : last ? <span title={absoluteTime(last)}>Checked {ago(last, now)}</span> : null}</p>
      </PageHeader>
      {error ? <ErrorLine message={error} /> : null}
      {!ready && !error ? <p className="text-[16px] text-fg-2">Loading…</p> : null}

      {ready && list.length ? (
        <section aria-label="Projects">
          <ul className="border-t border-line-1">
            {shown.map((r) => (
              <ProjectRow key={r.project.id} name={r.name} status={r.status} />
            ))}
            {showQuiet ? folded.map((r) => <ProjectRow key={r.project.id} name={r.name} status={r.status} />) : null}
          </ul>
          {folded.length ? (
            <button
              type="button"
              aria-expanded={showQuiet}
              onClick={() => setShowQuiet((v) => !v)}
              className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-lg text-[14px] text-fg-2 underline decoration-line-3 underline-offset-4 outline-none hover:text-fg hover:decoration-fg focus-visible:ring-2 focus-visible:ring-fg/40"
            >
              {showQuiet ? "Hide the quiet ones" : `${folded.length} more with nothing to report${stopped ? `, ${stopped} not watched` : ""}`}
            </button>
          ) : null}
        </section>
      ) : null}

      {ready && !list.length ? (
        <Empty title="No projects yet.">
          Spooky lists every repo on the GitHub accounts you install it on.{" "}
          <Link href="/app/settings" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
            Add one in Settings
          </Link>
          .
        </Empty>
      ) : null}
    </>
  );
}

const shortOwner = (name: string) => {
  const i = name.lastIndexOf("/");
  return i < 0 ? { owner: null, repo: name } : { owner: name.slice(0, i + 1), repo: name.slice(i + 1) };
};

/** One project: dot, name, status in words, chevron. The whole row is the link. */
function ProjectRow({ name, status }: { name: string; status: ProjectStatus }) {
  const { owner, repo } = shortOwner(name);
  const body = (
    <>
      <span aria-hidden className={`mt-[7px] size-2 shrink-0 self-start rounded-full sm:mt-0 sm:self-center ${TONE_DOT[status.tone]}`} />
      <span className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:items-baseline sm:gap-x-6">
        <span className="block truncate font-mono text-[14px] text-fg">
          {owner ? <span className="text-fg-3">{owner}</span> : null}
          {repo}
        </span>
        <span className="mt-0.5 block text-[14px] leading-[1.45] text-pretty text-fg-2 sm:mt-0">
          <span className={TONE_WORD[status.tone]}>{status.word}</span>
          {status.detail ? `: ${status.detail}` : null}
        </span>
      </span>
    </>
  );
  const cls = "group flex min-h-14 items-center gap-3 py-3 pr-1 sm:min-h-12 sm:gap-4";
  return (
    <li className="border-b border-line-1">
      {name.includes("/") ? (
        <Link href={projectHref(name)} className={`${cls} -mx-2 rounded-lg px-2 outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-fg/40`}>
          {body}
          <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0 text-fg-3 transition-colors group-hover:text-fg" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ) : (
        <div className={cls}>
          {body}
          <span aria-hidden className="size-3.5 shrink-0" />
        </div>
      )}
    </li>
  );
}
