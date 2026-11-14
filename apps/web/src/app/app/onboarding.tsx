"use client";
/**
 * First run on Today: GitHub and Vercel until each has finished a first sync. After the first one
 * syncs, only the step that is left shows. Gmail is not a
 * setup step; an inbox is an optional extra on the Connections page. A connection
 * that stops later becomes a row in Today's list. Reads the same /api/v1/connections data
 * as the Connections page.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Meter, SectionTitle, buttonStyles, surface } from "@/components/ui";
import { ConnectionState } from "./connection-state";
import { authClient } from "@/lib/auth-client";
import { connectError, isSynced, progressLine, runningPercent, type Connection } from "./connection-model";

const GITHUB_START = "/api/connect/github/start?next=/app";
const GMAIL_START = "/api/connect/gmail/start?next=/app";
/** The Vercel connect form lives on Connections; ?vercel=open opens it. */
const VERCEL_START = "/app/connections?vercel=open#vercel";

const live = (list: Connection[], provider: Connection["provider"]) => list.filter((c) => c.provider === provider && c.status !== "revoked");

/** The connection that best represents a provider: active first, then errored. */
function pick(list: Connection[], provider: Connection["provider"]): Connection | null {
  const mine = live(list, provider);
  return mine.find((c) => c.status === "active") ?? mine[0] ?? null;
}

export function onboardingComplete(list: Connection[]): boolean {
  const gh = pick(list, "github");
  const vc = pick(list, "vercel");
  return Boolean(gh && vc && isSynced(gh) && isSynced(vc));
}

type StepState = "todo" | "syncing" | "done" | "errored";

function stepState(list: Connection[], provider: Connection["provider"]): StepState {
  const mine = live(list, provider);
  if (!mine.length) return "todo";
  if (mine.some((c) => c.status === "errored")) return "errored";
  if (mine.some(isSynced)) return "done";
  return "syncing";
}

/** Drawn state mark, 20px. Not a number: order is already the reading order. */
function Mark({ state }: { state: StepState }) {
  const label = {
    todo: "Not started",
    syncing: "Syncing",
    done: "Done",
    errored: "Needs attention",
  }[state];
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" role="img" aria-label={label}>
      {state === "done" ? (
        <>
          <circle cx="10" cy="10" r="9" className="fill-fg" />
          <path d="M6 10.4 8.7 13 14 7.4" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="stroke-bg" />
        </>
      ) : state === "errored" ? (
        <>
          <circle cx="10" cy="10" r="8.5" fill="none" strokeWidth="1.25" className="stroke-amber" />
          <path d="M10 5.8v5" strokeWidth="1.6" strokeLinecap="round" className="stroke-amber" />
          <circle cx="10" cy="13.9" r="0.95" className="fill-amber" />
        </>
      ) : state === "syncing" ? (
        <>
          <circle cx="10" cy="10" r="8.5" fill="none" strokeWidth="1.25" className="stroke-line-3" />
          <g className="orbit">
            <path d="M10 1.5a8.5 8.5 0 0 1 8.5 8.5" fill="none" strokeWidth="1.5" strokeLinecap="round" className="stroke-fg" />
          </g>
        </>
      ) : (
        <circle cx="10" cy="10" r="8.5" fill="none" strokeWidth="1.25" className="stroke-fg-3" />
      )}
    </svg>
  );
}

/** One connected account under a step: identifier, numbers, state; a reconnect when it needs one. */
function Account({ c, primary, now }: { c: Connection; primary: boolean; now: number }) {
  const line = progressLine(c);
  const errored = c.status === "errored";
  const percent = runningPercent(c);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <span className="min-w-0 flex-1 basis-40 truncate font-mono text-[14px] text-fg">{c.display}</span>
      <ConnectionState c={c} now={now} />
      {line ? <span className={`num basis-full text-[14px] text-pretty ${errored ? "text-amber" : "text-fg-2"}`}>{line}</span> : null}
      {percent !== null ? (
        <div className="mt-1.5 basis-full">
          <Meter percent={percent} label={`${c.display} sync progress`} />
        </div>
      ) : null}
      {errored && c.provider === "gmail" ? (
        <a href={GMAIL_START} className={`${primary ? buttonStyles.repair : buttonStyles.secondary} mt-2`}>
          Reconnect
        </a>
      ) : null}
    </li>
  );
}

function Step({
  state,
  title,
  note,
  action,
  accounts,
  now,
}: {
  state: StepState;
  title: ReactNode;
  note: ReactNode;
  action?: ReactNode;
  accounts?: Connection[];
  now: number;
}) {
  const anyActive = accounts?.some((c) => c.status === "active") ?? false;
  return (
    <li className="grid grid-cols-[20px_1fr] gap-x-4 border-b border-line-1 px-4 py-5 last:border-b-0 sm:px-6">
      <div className="pt-3 sm:pt-px">
        <Mark state={state} />
      </div>
      <div className="min-w-0">
        <div className="flex min-h-5 items-center justify-between gap-4">
          <h3 className="min-w-0 text-[16px] leading-[1.3] font-medium text-balance text-fg">{title}</h3>
          {action ? <div className="shrink-0 sm:-my-1.5">{action}</div> : null}
        </div>
        <p className="mt-1 max-w-[60ch] text-[14px] leading-[1.55] text-pretty text-fg-2">{note}</p>
        {accounts?.length ? (
          <ul className="mt-3 divide-y divide-line-1 border-t border-line-1">
            {accounts.map((c) => (
              <Account key={c.id} c={c} primary={!anyActive} now={now} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

const GITHUB_NOTICE: Record<string, string> = {
  requested: "Install requested. An owner of that organization approves it on GitHub.",
  confirm: "Add the GitHub account that made the install to finish. Signing in to it only proves the install is yours; the install then links on its own.",
};

export function Onboarding({ connections, params, now }: { connections: Connection[]; params: URLSearchParams; now: number }) {
  const [linking, setLinking] = useState(false);
  const gh = live(connections, "github");
  const vc = live(connections, "vercel");
  const ghState = stepState(connections, "github");
  const vcState = stepState(connections, "vercel");
  const ghActive = gh.some((c) => c.status === "active");
  const vcActive = vc.some((c) => c.status === "active");
  const synced = [ghState === "done", vcState === "done"].filter(Boolean).length;
  // Once one source has synced, the card shrinks to the step that is left; the synced one lives on Connections.
  const showGithub = !(synced === 1 && ghState === "done");
  const showVercel = !(synced === 1 && vcState === "done");
  // After any first sync, steps drop their per-account rows to one line; the accounts live on Connections.
  const compact = [...gh, ...vc].some(isSynced);
  const brief = (list: Connection[], full: string): ReactNode => {
    if (!compact || !list.length) return full;
    const done = list.filter(isSynced).length;
    const errored = list.filter((c) => c.status === "errored").length;
    return (
      <>
        {done} of {list.length} {list.length === 1 ? "account" : "accounts"} synced{errored ? `, ${errored} ${errored === 1 ? "needs" : "need"} attention` : ""}.{" "}
        <Link href="/app/connections" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
          Accounts
        </Link>
      </>
    );
  };

  const error = params.get("error");
  const githubNotice = params.get("github");

  const confirmGithub = async () => {
    setLinking(true);
    await authClient.linkSocial({ provider: "github", callbackURL: "/app" });
    setLinking(false);
  };

  return (
    <section aria-labelledby="setup-title" className="mb-12">
      <SectionTitle id="setup-title" count={`${[gh.some(isSynced), vc.some(isSynced)].filter(Boolean).length} of 2 synced`}>
        Setup
      </SectionTitle>

      {error ? <p className="mb-3 text-[14px] text-amber">{connectError(error)}</p> : null}
      {githubNotice && GITHUB_NOTICE[githubNotice] ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="max-w-[60ch] text-[14px] text-fg-2">{GITHUB_NOTICE[githubNotice]}</p>
          {githubNotice === "confirm" ? (
            <button type="button" className={buttonStyles.secondary} disabled={linking} onClick={confirmGithub}>
              {linking ? "Redirecting…" : "Add GitHub account"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={surface}>
        <ol>
          {showGithub ? (
            <Step
              state={ghState}
              title="GitHub"
              note={brief(gh, "Read-only. You choose the repos on GitHub.")}
              accounts={compact ? undefined : gh}
              now={now}
              action={
                <a href={GITHUB_START} className={ghActive ? buttonStyles.ghost : buttonStyles.primary}>
                  {ghActive ? "Add another" : "Install on GitHub"}
                </a>
              }
            />
          ) : null}
          {showVercel ? (
            <Step
              state={vcState}
              title="Vercel"
              note={brief(vc, "Read-only. Projects, deploys and schedules join the map.")}
              accounts={compact ? undefined : vc}
              now={now}
              action={
                <Link href={VERCEL_START} className={vcActive ? buttonStyles.ghost : ghActive ? buttonStyles.primary : buttonStyles.secondary}>
                  {vcActive ? "Add another" : "Connect Vercel"}
                </Link>
              }
            />
          ) : null}
        </ol>
      </div>
    </section>
  );
}
