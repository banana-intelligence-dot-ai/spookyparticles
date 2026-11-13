"use client";
/**
 * Today: is anything broken, and does my agent know? Spend is a column in the rows, never a headline.
 * What was caught and fixed in 30 days on top, two figures, who hears, then one ranked list of at most ten rows. Setup shows only until
 * GitHub and Gmail have each finished a first sync.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorLine } from "@/components/ui";
import { useApi } from "@/components/use-api";
import type { Listening } from "@/lib/agent-listening";
import type { Catches } from "@/lib/catches";
import { CatchLog } from "./catch-log";
import { isRunning, type Connection } from "./connection-model";
import { absoluteTime, plural, type Finding, type Findings, type Spend } from "./data-model";
import { Onboarding, onboardingComplete } from "./onboarding";
import { ago, type ActivityReport, type ProjectsReport } from "./project-model";
import { buildToday, type JobRow, type TodayFix, type TodayRow, type TodayTone } from "./today-model";
import { agentButton, CopyForAgent } from "./copy-for-agent";

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
  const listening = useApi<Listening>("/api/v1/agents/listening", { pollMs: () => 60_000 });
  const { reload: reloadListening } = listening;
  const catches = useApi<Catches>("/api/v1/catches", { pollMs: () => 60_000 });
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
      listening={listening.data ?? null}
      catches={catches.data ?? null}
      params={params}
      error={conns.error ?? projects.error}
      now={now ?? 0}
      onChanged={() => {
        void reloadProjects();
        void reloadListening();
      }}
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
  listening = null,
  catches = null,
  params,
  error,
  now,
  onChanged,
}: {
  ready: boolean;
  connections: Connection[];
  projects: ProjectsReport | null;
  findings: Finding[];
  spend: Spend | null;
  activity: ActivityReport | null;
  jobs: JobRow[];
  checkOpen?: number;
  /** Which sessions hear about which projects; null until loaded. */
  listening?: Listening | null;
  /** What was caught in 30 days and how fast it was fixed; null until loaded. */
  catches?: Catches | null;
  params: URLSearchParams;
  error: string | null;
  now: number;
  /** After an ignore or undo, so the list re-reads. */
  onChanged?: () => void;
}) {
  const [undo, setUndo] = useState<{ fix: TodayFix; what: string } | null>(null);
  const ignore = async (fix: TodayFix, what: string, on: boolean) => {
    if (!fix.ignoreKey) return false;
    const res = await fetch("/api/v1/incidents/ignore", {
      method: on ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: fix.ignoreKey, project: fix.project }),
    });
    if (!res.ok) return false;
    setUndo(on ? { fix, what } : null);
    onChanged?.();
    return true;
  };
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
          {catches ? <CatchLog data={catches} now={now} /> : null}

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

          {listening ? <Agents data={listening} now={now} /> : null}

          <section aria-labelledby="needs-title">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="needs-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
                What to do
              </h2>
              <p className="text-[14px] text-fg-3">{syncing ? "Syncing now" : last ? <span title={absoluteTime(last)}>Checked {ago(last, now)}</span> : null}</p>
            </div>
            {undo ? (
              <p className="flex min-h-11 flex-wrap items-center gap-x-3 border-t border-line-1 text-[14px] text-fg-2" aria-live="polite">
                Ignored {undo.what}. A new failure will show again.
                <button
                  type="button"
                  onClick={() => void ignore(undo.fix, undo.what, false)}
                  className="inline-flex h-11 items-center text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg"
                >
                  Undo
                </button>
              </p>
            ) : null}
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
                          <Row key={r.id} r={r} onIgnore={r.fix?.ignoreKey ? () => ignore(r.fix as TodayFix, r.what, true) : undefined} />
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
                  History
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

/**
 * Your agents: does each coding session hear when its project breaks. A session is listening
 * once it has asked about its project (the session hook asks at session start). A broken
 * project no session asked about in 14 days is the gap this section exists to show.
 */
function Agents({ data, now }: { data: Listening; now: number }) {
  const rows = [...data.unheard.map((u) => ({ ...u, heard: false as const })), ...data.listeners.map((l) => ({ ...l, heard: true as const }))];
  return (
    <section aria-labelledby="agents-title" className="mb-14">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="agents-title" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
          Your agents
        </h2>
        <p className="text-[14px] text-fg-3">Who hears when a project breaks</p>
      </div>
      {data.listeners.length === 0 ? (
        <p className="border-t border-line-1 py-4 text-[16px] leading-[1.45] text-pretty text-fg-2">
          No coding session is listening yet, so a break reaches you but not your agents.{" "}
          <Link href="/app/connections#agents" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
            Connect an agent
          </Link>{" "}
          and give it the session hook from the{" "}
          <a href="/setup.md" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
            setup steps
          </a>
          .
        </p>
      ) : null}
      {rows.length ? (
        <ol className={data.listeners.length ? "border-t border-line-1" : ""}>
          {rows.map((r) => (
            <li key={`${r.heard}-${r.project}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-b border-line-1 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-[14px] text-fg">{r.project}</p>
                <p className="mt-0.5 text-[12px] leading-[1.5] text-fg-3">
                  {r.heard ? (
                    <span title={absoluteTime(r.lastAskedAt)}>
                      Asked {ago(r.lastAskedAt, now)}
                      {r.agent ? ` by ${r.agent}` : ""}
                    </span>
                  ) : (
                    "No session has asked about this project"
                  )}
                </p>
              </div>
              {r.open ? (
                <a href="#needs-title" className="inline-flex min-h-11 items-center text-right text-[14px] whitespace-nowrap text-red underline decoration-red/40 underline-offset-4 hover:decoration-red">
                  {plural(r.open, "open problem", "open problems")}
                </a>
              ) : (
                <p className="text-right text-[14px] whitespace-nowrap text-fg-3">Nothing broken</p>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
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

function Row({ r, onIgnore }: { r: TodayRow; onIgnore?: () => Promise<boolean> }) {
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
        {r.fix ? <FixActions prompt={r.fix.prompt} onIgnore={onIgnore} /> : null}
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

/**
 * Hand a break to your coding agent: copy words that say what failed, the evidence, and to fix
 * it and prove it on production, or explain why it should be ignored. Ignore stops counting this
 * one failure; the next one shows again.
 */
function FixActions({ prompt, onIgnore }: { prompt: string; onIgnore?: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [ignoreFailed, setIgnoreFailed] = useState(false);
  return (
    <div className="mt-3">
      <CopyForAgent prompt={prompt}>
        {onIgnore ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onIgnore();
              setBusy(false);
              setIgnoreFailed(!ok);
            }}
            className={`${agentButton} text-fg-2 hover:text-fg disabled:opacity-60`}
          >
            {busy ? "Ignoring…" : "Ignore"}
          </button>
        ) : null}
      </CopyForAgent>
      {ignoreFailed ? <p className="mt-1 text-[12px] text-red">Spooky couldn&apos;t save that. Try again.</p> : null}
    </div>
  );
}
