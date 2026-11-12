"use client";
/**
 * Today: is anything broken and what needs me this week. Spend is a column in the rows, never a headline.
 * Two figures, then one ranked list of at most ten rows. Setup shows only until
 * GitHub and Gmail have each finished a first sync.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorLine } from "@/components/ui";
import { useApi } from "@/components/use-api";
import { isRunning, type Connection } from "./connection-model";
import { absoluteTime, plural, type Finding, type Findings, type Spend } from "./data-model";
import { Onboarding, onboardingComplete } from "./onboarding";
import { ago, type ActivityReport, type ProjectsReport } from "./project-model";
import { buildToday, type JobRow, type TodayRow, type TodayTone } from "./today-model";

export function TodayView() {
  const params = useSearchParams();
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => isRunning(c.sync)) ? 5000 : null),
  });
  const projects = useApi<ProjectsReport>("/api/v1/projects");
  const findings = useApi<Findings>("/api/v1/findings");
  const spend = useApi<Spend>("/api/v1/spend");
  const activity = useApi<ActivityReport>("/api/v1/activity");
  const checkins = useApi<{ jobs: JobRow[] }>("/api/v1/checkins", {
    pollMs: () => 60_000,
  });
  const checks = useApi<{ summary: { open: number } }>("/api/v1/checks", {
    pollMs: () => 60_000,
  });
  const { reload: reloadProjects } = projects;

  // While a sync runs, connections poll and the list refills on the same beat.
  useEffect(() => {
    if (conns.data) void reloadProjects();
  }, [conns.data, reloadProjects]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [projects.data]);

  return (
    <TodayScreen
      ready={Boolean(conns.data) && now !== null}
      connections={conns.data?.connections ?? []}
      projects={projects.data}
      findings={findings.status === 404 ? [] : (findings.data?.findings ?? [])}
      spend={spend.status === 404 ? null : spend.data}
      activity={activity.data}
      jobs={checkins.data?.jobs ?? []}
      checkOpen={checks.data?.summary.open ?? 0}
      params={params}
      error={conns.error ?? projects.error}
      now={now ?? 0}
    />
  );
}

const DOT: Record<TodayTone, string> = {
  red: "bg-red",
  amber: "bg-amber",
  grey: "bg-fg-3",
};
const GROUPS: [TodayTone, string][] = [
  ["red", "Broken"],
  ["amber", "Needs you this week"],
  ["grey", "Worth a look, no rush"],
];

export function TodayScreen({
  ready,
  connections,
  projects,
  findings,
  spend,
  activity,
  jobs,
  checkOpen = 0,
  params,
  error,
  now,
}: {
  ready: boolean;
  connections: Connection[];
  projects: ProjectsReport | null;
  findings: Finding[];
  spend: Spend | null;
  activity: ActivityReport | null;
  jobs: JobRow[];
  checkOpen?: number;
  params: URLSearchParams;
  error: string | null;
  now: number;
}) {
  const today = useMemo(
    () =>
      buildToday({
        projects: projects?.projects ?? [],
        findings,
        spend,
        notices: activity?.items ?? [],
        connections,
        jobs,
        checkOpen,
        now,
      }),
    [projects, findings, spend, activity, connections, jobs, checkOpen, now],
  );
  const setup = ready && !onboardingComplete(connections);
  const hasData = Boolean(projects?.projects.length || spend?.subscriptions.length);
  const last = connections
    .map((c) => c.lastSyncedAt)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);
  const syncing = connections.some((c) => isRunning(c.sync));
  const mailSynced = connections.some((c) => c.provider === "gmail" && c.status !== "revoked" && c.sync?.phase === "done" && Boolean(c.sync.finishedAt));
  const mailCount = connections.filter((c) => c.provider === "gmail" && c.status !== "revoked").length;

  return (
    <>
      <header className="mb-10">
        <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-fg">Today</h1>
      </header>
      {error ? <ErrorLine message={error} /> : null}
      {!ready && !error ? <p className="text-[16px] text-fg-2">Loading…</p> : null}
      {setup ? <Onboarding connections={connections} params={params} now={now} /> : null}

      {ready && hasData ? (
        <>
          <section aria-label="Today in two numbers" className="mb-14 grid max-w-[720px] grid-cols-1 gap-y-5 sm:grid-cols-2 sm:gap-x-12">
            <Figure
              href="#needs-title"
              value={String(today.broken)}
              tone={today.broken ? "red" : null}
              label="Broken now"
              source={`Failed deploys, missed runs, sites down${mailCount ? ", bounced cards" : ""}`}
            />
            <Figure
              href="#needs-title"
              value={mailSynced ? String(today.needsWeek) : null}
              tone={today.needsWeek ? "amber" : null}
              label="Need you this week"
              source={mailSynced ? "Renewals, trials and fixes due in 7 days" : mailCount ? "Waits for your inbox to finish syncing" : "Needs an inbox"}
            />
          </section>

          <section aria-labelledby="needs-title">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="needs-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
                What to do
              </h2>
              <p className="text-[14px] text-fg-3">{syncing ? "Syncing now" : last ? <span title={absoluteTime(last)}>Checked {ago(last, now)}</span> : null}</p>
            </div>
            {today.rows.length ? (
              <div className="flex flex-col gap-6">
                {GROUPS.map(([tone, title]) => {
                  const list = today.rows.filter((r) => r.tone === tone);
                  if (!list.length) return null;
                  return (
                    <div key={tone}>
                      <h3 className="flex items-center gap-2 border-b border-line-1 pb-2 text-[12px] font-medium tracking-[0.02em] text-fg-2">
                        <span aria-hidden className={`size-[7px] rounded-full ${DOT[tone]}`} />
                        {title}
                        <span className="num font-mono font-normal text-fg-3">{list.length}</span>
                      </h3>
                      <ol>
                        {list.map((r) => (
                          <Row key={r.id} r={r} />
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="border-t border-line-1 py-6 text-[16px] text-fg-2">Nothing is broken and nothing needs you. Spooky Particles keeps watching.</p>
            )}
            {today.more ? (
              <p className="mt-3 text-[14px] text-fg-3">
                {plural(today.more, "smaller item", "smaller items")} left off to keep this to ten. See{" "}
                <Link href="/app/activity" className="text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
                  Activity
                </Link>
                .
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}

/** One figure. Phone: number left, words right. Wide: number on top. Null reads "not yet", never a fake zero. */
function Figure({ href, value, tone, label, source }: { href: string; value: string | null; tone: "red" | "amber" | null; label: string; source: string }) {
  const body = (
    <>
      {value === null ? (
        <span className="block w-20 shrink-0 text-[20px] leading-[32px] text-fg-3 sm:w-auto sm:text-[24px] sm:leading-[48px]">Not yet</span>
      ) : (
        <span className="num flex w-20 shrink-0 items-center gap-3 text-[32px] leading-none font-medium tracking-[-0.025em] text-fg sm:w-auto sm:text-[48px]">
          {value}
          {tone ? <span aria-hidden className={`size-2 rounded-full ${DOT[tone]}`} /> : null}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[14px] leading-[1.3] text-fg sm:mt-3">{label}</span>
        <span className="mt-1 block text-[12px] leading-[1.4] text-pretty text-fg-3">{source}</span>
      </span>
    </>
  );
  const cls = "group flex min-w-0 items-start gap-4 sm:block";
  return href.startsWith("#") ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/** Meta pieces for one line: when, then where it came from. Each piece keeps its own dot so none is left alone on a wrap. */
function metaParts(r: TodayRow): string[] {
  return [r.when, ...r.source.split(" · ")].filter((x): x is string => Boolean(x));
}

function Row({ r }: { r: TodayRow }) {
  const meta = metaParts(r);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-x-3 border-b border-line-1 py-4 sm:grid-cols-[minmax(0,1fr)_104px_120px] sm:items-center sm:gap-x-6">
      <div className="min-w-0">
        <p className="text-[16px] leading-[1.35] text-pretty text-fg">
          <span className="sr-only">{r.tone === "red" ? "Broken: " : r.tone === "amber" ? "Needs you: " : "Worth a look: "}</span>
          {r.what}
        </p>
        <p className="mt-1 text-[14px] leading-[1.45] text-pretty text-fg-2">{r.why}</p>
        {meta.length ? (
          <p className="mt-1 flex flex-wrap gap-x-1.5 text-[12px] leading-[1.5] text-fg-3" title={r.at ? absoluteTime(new Date(r.at).toISOString()) : undefined}>
            {meta.map((m, i) => (
              <span key={i} className="max-w-full truncate whitespace-nowrap">
                {i ? (
                  <span aria-hidden className="mr-1.5">
                    ·
                  </span>
                ) : null}
                {m}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {r.action || r.amount ? (
        <div className="-mb-2 flex items-center gap-4 sm:col-span-2 sm:col-start-2 sm:mb-0 sm:grid sm:grid-cols-[104px_120px] sm:gap-6">
          {r.amount ? (
            <span className="num font-mono text-[14px] whitespace-nowrap text-fg-2 sm:text-right">{r.amount.replace(/\.00\b/, "")}</span>
          ) : (
            <span className="hidden sm:block" />
          )}
          {r.action?.external ? (
            <a
              href={r.action.href}
              target="_blank"
              rel="noreferrer"
              title={r.action.site ? `${r.action.label} on ${r.action.site}` : undefined}
              className="inline-flex h-11 min-w-0 items-center gap-1 text-[14px] text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg sm:h-8 sm:justify-self-end sm:text-right"
            >
              {r.action.label}
              {r.action.site ? <span className="sr-only"> on {r.action.site}</span> : null}
              <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 3.5h6.5V10M12.5 3.5 4 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ) : r.action ? (
            <Link
              href={r.action.href}
              className="inline-flex h-11 items-center text-[14px] whitespace-nowrap text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg sm:h-8 sm:justify-self-end"
            >
              {r.action.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
